const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

// Expressアプリを作成
const app = express();

// ExpressをHTTPサーバーとして利用するためにラップする
const server = http.createServer(app);

// Socket.ioを使ってリアルタイム通信を有効化
const io = new Server(server);

// publicフォルダの中身をそのまま配信する（例: /admin.html）
app.use(express.static(path.join(__dirname, "public")));

// dataフォルダを /data 配下で配信する（例: /data/survey/1.svg）
app.use("/data", express.static(path.join(__dirname, "data")));

// 問題データをJSONファイルから読み込む
const questionsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "questions.json"), "utf-8")
);
// 新形式 { practice, questions } と旧形式（配列）の両方に対応
const questions = Array.isArray(questionsData)
  ? questionsData
  : questionsData.questions || [];
const practiceQuestion = Array.isArray(questionsData)
  ? {
      id: "practice",
      questionText:
        "【例題】操作確認です。0〜100の数字を選んで「決定」を押してください。正解発表はありません。"
    }
  : questionsData.practice || {
      id: "practice",
      questionText:
        "【例題】操作確認です。0〜100の数字を選んで「決定」を押してください。正解発表はありません。"
    };

// 管理画面用パスワード（data/admin-config.json で変更できる）
let adminPassword = "quiz-admin";
let seatNumbers = [];
try {
  const adminConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "admin-config.json"), "utf-8")
  );
  if (adminConfig.adminPassword) {
    adminPassword = String(adminConfig.adminPassword);
  }
  if (Array.isArray(adminConfig.seatNumbers)) {
    seatNumbers = adminConfig.seatNumbers;
  }
} catch (e) {
  // 設定ファイルが無い場合はデフォルトを使う
  seatNumbers = Array.from({ length: 20 }, (_, i) => i + 1);
}

// タイマー停止用にsetIntervalのIDを保持する
let timerInterval = null;

// 1問あたりの制限時間（秒）…デフォルト3分
const QUESTION_TIME_SECONDS = 180;

// 例題の制限時間（秒）…操作確認用なので短め
const PRACTICE_TIME_SECONDS = 60;

// 制限時間切れ時、未回答者がいる場合に自動延長する秒数
const AUTO_EXTEND_SECONDS = 30;

// 参加時に必要なコード（管理者が設定する。一般参加者には放送しない）
let joinCode = "";

// 管理者としてログイン済みか判定する
function isAdminSocket(socket) {
  return socket.data && socket.data.isAdmin === true;
}

// イベント全体の状態をまとめて管理する
const eventState = {
  status: "waiting", // waiting / started / question / answer_closed / answers_revealed / correct_revealed / survey_results / ranking_revealed / results_announced / finished
  teams: [], // 参加チーム一覧（各チーム: id, name, seatNumber, score, online）
  hasQuestionStarted: false, // 1度でも本番問題を出したか
  isPractice: false, // 例題中か（正解発表・得点計算はしない）
  currentQuestionIndex: -1, // 現在の問題番号（配列index）
  currentQuestion: null, // 画面表示用の現在問題
  currentQuestionId: null, // 問題切り替え判定用ID
  surveyImageUrl: null, // アンケート結果画像のURL（問題ごと）
  answers: {}, // { socket.id: answer }
  answeredCount: 0, // 回答済み件数
  remainingTime: null, // タイマー残り秒数
  revealedAnswers: [], // 公開用の回答一覧
  correctAnswer: null, // 公開された正解
  ranking: [], // 現在の順位表
  questionCount: questions.length, // 全問題数
  hasMoreQuestions: false, // まだ次の問題があるか
  // 出題済み問題の回答履歴（未出題は含めない。公開は finished 時のみ）
  answerHistory: [],
  // 結果発表で公開済みの段階（0=未発表, 1=まず最下位側…最大3）
  resultsRevealStep: 0
};

// 座席番号を除いたチーム情報を作る（参加者・スクリーン向け）
function toPublicTeam(team) {
  return {
    id: team.id,
    name: team.name,
    score: team.score,
    online: team.online !== false
  };
}

// 進捗・次問有無などを状態へ反映する
function refreshDerivedFields() {
  eventState.questionCount = questions.length;
  eventState.hasMoreQuestions =
    eventState.currentQuestionIndex + 1 < questions.length;
  eventState.answeredCount = Object.keys(eventState.answers).length;
}

// 画面表示用の問題オブジェクト（正解は含めない）
function toPublicQuestion(question) {
  if (!question) {
    return null;
  }

  const focusOptions = (Array.isArray(question.focusOptions)
    ? question.focusOptions
    : [question.focusOption]
  )
    .map((key) => String(key || "").toUpperCase().trim())
    .filter((key) => key.length > 0);

  return {
    id: question.id,
    questionText: question.questionText,
    surveyQuestion: question.surveyQuestion || null,
    surveyOptions: Array.isArray(question.surveyOptions)
      ? question.surveyOptions
      : [],
    // 互換性維持のため先頭要素を focusOption にも載せる
    focusOption: focusOptions[0] || null,
    focusOptions,
    surveyImage: question.surveyImage || null
  };
}

// 管理者向けの回答状況一覧（座席番号つき）
function buildAnswerStatus() {
  return eventState.teams.map((team) => ({
    name: team.name,
    seatNumber: team.seatNumber,
    answered: eventState.answers[team.id] !== undefined,
    online: team.online !== false
  }));
}

// 管理者向けの問題一覧
function buildQuestionList() {
  return questions.map((question, index) => ({
    index,
    id: question.id,
    questionText: question.questionText,
    isCurrent: index === eventState.currentQuestionIndex
  }));
}

// 一般画面向けの状態（座席番号・参加コードは含めない）
function getPublicState() {
  refreshDerivedFields();
  return {
    ...eventState,
    teams: eventState.teams.map(toPublicTeam),
    ranking: eventState.ranking.map(toPublicTeam),
    // 進行中に正解が漏れないよう、レビュー用履歴は終了後のみ公開
    answerHistory:
      eventState.status === "finished" ? eventState.answerHistory : []
  };
}

// 管理画面向けの状態（座席番号・参加コード・回答状況・問題一覧を含める）
function getAdminState() {
  refreshDerivedFields();
  return {
    ...eventState,
    joinCode,
    teams: eventState.teams,
    ranking: eventState.ranking,
    answerStatus: buildAnswerStatus(),
    questionList: buildQuestionList(),
    // 表示用: 現在何問目か（未出題なら 0）
    currentQuestionNumber:
      eventState.currentQuestionIndex >= 0
        ? eventState.currentQuestionIndex + 1
        : 0
  };
}

// 全クライアントへ最新状態を送る
function broadcastState() {
  io.except("admins").emit("stateUpdated", getPublicState());
  io.to("admins").emit("stateUpdated", getAdminState());
}

// タイマー停止
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// 回答受付を終了する（手動・時間切れ・全員回答で共用）
function closeAnswerPhase() {
  if (eventState.status !== "question") {
    return;
  }
  eventState.status = "answer_closed";
  eventState.remainingTime = 0;
  stopTimer();
}

// イベント状態を初期状態へ戻す（チームもクリア）
function resetEventState() {
  stopTimer();
  eventState.status = "waiting";
  eventState.teams = [];
  eventState.hasQuestionStarted = false;
  eventState.isPractice = false;
  eventState.currentQuestionIndex = -1;
  eventState.currentQuestion = null;
  eventState.currentQuestionId = null;
  eventState.surveyImageUrl = null;
  eventState.answers = {};
  eventState.answeredCount = 0;
  eventState.remainingTime = null;
  eventState.revealedAnswers = [];
  eventState.correctAnswer = null;
  eventState.ranking = [];
  eventState.hasMoreQuestions = false;
  eventState.answerHistory = [];
  eventState.resultsRevealStep = 0;
}

// 参加受付状態へ戻す（チームは残す）
function reopenJoinPhase() {
  stopTimer();
  eventState.status = "waiting";
  eventState.hasQuestionStarted = false;
  eventState.isPractice = false;
  eventState.currentQuestionIndex = -1;
  eventState.currentQuestion = null;
  eventState.currentQuestionId = null;
  eventState.surveyImageUrl = null;
  eventState.answers = {};
  eventState.answeredCount = 0;
  eventState.remainingTime = null;
  eventState.revealedAnswers = [];
  eventState.correctAnswer = null;
  eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);
  eventState.hasMoreQuestions = false;
  eventState.answerHistory = [];
  eventState.resultsRevealStep = 0;
}

// 例題を終了して「開始済み」に戻す（本番問題はまだ出していない）
function endPracticePhase() {
  stopTimer();
  eventState.isPractice = false;
  eventState.status = "started";
  eventState.currentQuestion = null;
  eventState.currentQuestionId = null;
  eventState.surveyImageUrl = null;
  eventState.answers = {};
  eventState.answeredCount = 0;
  eventState.remainingTime = null;
  eventState.revealedAnswers = [];
  eventState.correctAnswer = null;
  // hasQuestionStarted は false のまま（例題では本番開始扱いにしない）
}

// 現在の本番問題を回答履歴へ記録する（未出題・例題・二重記録はスキップ）
function recordCurrentQuestionToHistory() {
  if (eventState.isPractice) {
    return;
  }
  if (eventState.currentQuestionIndex < 0 || !eventState.currentQuestion) {
    return;
  }

  const alreadyRecorded = eventState.answerHistory.some(
    (entry) => entry.questionIndex === eventState.currentQuestionIndex
  );
  if (alreadyRecorded) {
    return;
  }

  const question = questions[eventState.currentQuestionIndex];

  eventState.answerHistory.push({
    questionIndex: eventState.currentQuestionIndex,
    questionId: eventState.currentQuestionId,
    questionText: eventState.currentQuestion.questionText,
    correctAnswer: question ? question.correctAnswer : null,
    teamAnswers: eventState.teams.map((team) => ({
      teamName: team.name,
      answer:
        eventState.answers[team.id] !== undefined
          ? eventState.answers[team.id]
          : null
    }))
  });
}

// 最終結果を残して終了状態にする
function finishEventKeepResults() {
  stopTimer();
  // 途中終了でも「出題済みの現在問題」はレビュー対象に含める
  recordCurrentQuestionToHistory();
  eventState.status = "finished";
  eventState.remainingTime = null;
  eventState.surveyImageUrl = null;
  // 最終順位を確定表示用に残す
  eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);
}

// タイマー開始
function startTimer(seconds) {
  stopTimer();
  eventState.remainingTime = seconds;
  broadcastState();

  timerInterval = setInterval(() => {
    if (eventState.remainingTime === null) {
      stopTimer();
      return;
    }

    eventState.remainingTime -= 1;

    // 0秒になったとき
    if (eventState.remainingTime <= 0) {
      refreshDerivedFields();
      const hasTeams = eventState.teams.length > 0;
      const allAnswered =
        hasTeams && eventState.answeredCount >= eventState.teams.length;

      if (hasTeams && !allAnswered) {
        // 未回答のチームがいる → 自動で延長する
        eventState.remainingTime = AUTO_EXTEND_SECONDS;
      } else {
        // 全員回答済み、またはチームがいない → 受付終了
        closeAnswerPhase();
      }
    }

    broadcastState();
  }, 1000);
}

// 回答公開用の配列を作る
function buildRevealedAnswers() {
  return eventState.teams.map((team) => ({
    teamName: team.name,
    answer:
      eventState.answers[team.id] !== undefined ? eventState.answers[team.id] : null
  }));
}

// 得点計算
function updateScores() {
  const question = questions[eventState.currentQuestionIndex];
  if (!question) return;

  const correctAnswer = question.correctAnswer;

  eventState.teams.forEach((team) => {
    const answer = eventState.answers[team.id];

    // 未回答は得点変更なし
    if (answer === undefined) {
      return;
    }

    // 差分だけ減点
    const diff = Math.abs(answer - correctAnswer);
    team.score = team.score - diff;

    // 完全一致なら50点加算
    if (answer === correctAnswer) {
      team.score += 50;
    }
  });

  // 得点順に並べて順位を更新
  eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);
}

// 再接続時に古い socket.id の回答を新しい id へ移す
function migrateAnswers(oldSocketId, newSocketId) {
  if (oldSocketId === newSocketId) {
    return;
  }
  if (eventState.answers[oldSocketId] !== undefined) {
    eventState.answers[newSocketId] = eventState.answers[oldSocketId];
    delete eventState.answers[oldSocketId];
  }
}

// 既存チームへの再接続（チーム名・座席番号・参加コードが一致）
function reclaimTeam(socket, team) {
  const oldId = team.id;
  migrateAnswers(oldId, socket.id);
  team.id = socket.id;
  team.online = true;
  eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);

  socket.emit("joinResult", {
    success: true,
    message: `チーム「${team.name}」に再接続しました`,
    team: toPublicTeam(team),
    reconnected: true
  });

  broadcastState();
}

// ブラウザ接続時の処理
io.on("connection", (socket) => {
  // 接続した時点では一般画面向けの状態を送る
  socket.emit("stateUpdated", getPublicState());
  
  // プルダウン用の座席番号を送信
  socket.emit("seatNumbersLoaded", { seatNumbers });

  // 管理画面ログイン（パスワード必須）
  socket.on("adminLogin", (password) => {
    const entered = String(password || "");
    if (entered !== adminPassword) {
      socket.data.isAdmin = false;
      socket.emit("adminLoginResult", {
        success: false,
        message: "パスワードが正しくありません"
      });
      return;
    }

    socket.data.isAdmin = true;
    socket.join("admins");
    socket.emit("adminLoginResult", {
      success: true,
      message: "管理画面にログインしました"
    });
    socket.emit("stateUpdated", getAdminState());
  });

  // 参加コードを設定する（管理画面から）
  socket.on("setJoinCode", (code) => {
    if (!isAdminSocket(socket)) {
      return;
    }

    const trimmedCode = String(code || "").trim().toUpperCase();

    if (!trimmedCode) {
      socket.emit("joinCodeResult", {
        success: false,
        message: "参加コードを入力してください"
      });
      return;
    }

    joinCode = trimmedCode;
    socket.emit("joinCodeResult", {
      success: true,
      message: `参加コードを「${joinCode}」に設定しました`,
      joinCode
    });

    io.to("admins").emit("stateUpdated", getAdminState());
  });

  // チーム参加 / 再接続
  // 引数: { teamName, seatNumber, joinCode }
  socket.on("joinTeam", (payload) => {
    const data = typeof payload === "string" ? { teamName: payload } : payload || {};
    const trimmedName = String(data.teamName || "").trim();
    const trimmedSeat = String(data.seatNumber || "").trim();
    const enteredCode = String(data.joinCode || "").trim();

    if (!joinCode) {
      socket.emit("joinResult", {
        success: false,
        message: "参加コードがまだ設定されていません。管理者に連絡してください"
      });
      return;
    }

    if (!enteredCode) {
      socket.emit("joinResult", {
        success: false,
        message: "参加コードを入力してください"
      });
      return;
    }

    // 大文字小文字は区別しない
    if (enteredCode.toLowerCase() !== joinCode.toLowerCase()) {
      socket.emit("joinResult", {
        success: false,
        message: "参加コードが正しくありません"
      });
      return;
    }

    if (!trimmedName) {
      socket.emit("joinResult", {
        success: false,
        message: "チーム名を入力してください"
      });
      return;
    }

    if (!trimmedSeat) {
      socket.emit("joinResult", {
        success: false,
        message: "座席番号を入力してください"
      });
      return;
    }

    // 同じチーム名・座席番号の既存チームがいれば再接続として扱う
    const existingByName = eventState.teams.find((team) => team.name === trimmedName);
    const existingBySeat = eventState.teams.find(
      (team) => team.seatNumber === trimmedSeat
    );

    if (existingByName) {
      if (existingByName.seatNumber !== trimmedSeat) {
        socket.emit("joinResult", {
          success: false,
          message: "そのチーム名はすでに使われています"
        });
        return;
      }
      // チーム名・座席が一致 → 再接続（イベント開始後でも可）
      reclaimTeam(socket, existingByName);
      return;
    }

    if (existingBySeat) {
      socket.emit("joinResult", {
        success: false,
        message: "その座席番号はすでに使われています"
      });
      return;
    }

    // 新規参加は参加受付中（waiting）のみ
    if (eventState.status !== "waiting") {
      socket.emit("joinResult", {
        success: false,
        message: "参加受付は終了しています。再接続する場合は参加時と同じチーム名・座席番号を入力してください"
      });
      return;
    }

    const team = {
      id: socket.id,
      name: trimmedName,
      seatNumber: trimmedSeat,
      score: 100,
      online: true
    };

    eventState.teams.push(team);
    eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);

    socket.emit("joinResult", {
      success: true,
      message: `チーム「${trimmedName}」で参加しました`,
      team: toPublicTeam(team),
      reconnected: false
    });

    broadcastState();
  });

  // 参加後のチーム名・座席番号の更新（参加受付中のみ）
  socket.on("updateTeamInfo", (payload) => {
    if (eventState.status !== "waiting") {
      socket.emit("updateTeamResult", {
        success: false,
        message: "イベント開始後はチーム情報を変更できません"
      });
      return;
    }

    const data = payload || {};
    const trimmedName = String(data.teamName || "").trim();
    const trimmedSeat = String(data.seatNumber || "").trim();

    const team = eventState.teams.find((t) => t.id === socket.id);
    if (!team) {
      socket.emit("updateTeamResult", {
        success: false,
        message: "先にチーム参加してください"
      });
      return;
    }

    if (!trimmedName) {
      socket.emit("updateTeamResult", {
        success: false,
        message: "チーム名を入力してください"
      });
      return;
    }

    if (!trimmedSeat) {
      socket.emit("updateTeamResult", {
        success: false,
        message: "座席番号を入力してください"
      });
      return;
    }

    const nameTaken = eventState.teams.some(
      (t) => t.id !== socket.id && t.name === trimmedName
    );
    if (nameTaken) {
      socket.emit("updateTeamResult", {
        success: false,
        message: "そのチーム名はすでに使われています"
      });
      return;
    }

    const seatTaken = eventState.teams.some(
      (t) => t.id !== socket.id && t.seatNumber === trimmedSeat
    );
    if (seatTaken) {
      socket.emit("updateTeamResult", {
        success: false,
        message: "その座席番号はすでに使われています"
      });
      return;
    }

    team.name = trimmedName;
    team.seatNumber = trimmedSeat;
    eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);

    if (eventState.revealedAnswers.length > 0) {
      eventState.revealedAnswers = buildRevealedAnswers();
    }

    socket.emit("updateTeamResult", {
      success: true,
      message: `チーム情報を更新しました（${trimmedName} / 座席 ${trimmedSeat}）`,
      team: toPublicTeam(team)
    });

    broadcastState();
  });

  // イベント開始（この時点で新規参加は締め切る）
  socket.on("startEvent", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.status !== "waiting") {
      return;
    }

    if (eventState.teams.length < 1) {
      socket.emit("startEventResult", {
        success: false,
        message: "参加チームが1つ以上必要です"
      });
      return;
    }

    eventState.status = "started";
    broadcastState();
  });

  // 例題開始（回答操作の練習。正解発表・得点計算はしない）
  socket.on("startPractice", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    // 開始後・まだ本番問題を出していないときだけ
    if (eventState.status !== "started" || eventState.hasQuestionStarted) {
      return;
    }

    stopTimer();
    eventState.isPractice = true;
    eventState.currentQuestionIndex = -1;
    eventState.currentQuestion = toPublicQuestion(practiceQuestion);
    eventState.currentQuestionId = practiceQuestion.id;
    eventState.surveyImageUrl = null;
    eventState.status = "question";
    eventState.answers = {};
    eventState.answeredCount = 0;
    eventState.revealedAnswers = [];
    eventState.correctAnswer = null;
    refreshDerivedFields();

    startTimer(PRACTICE_TIME_SECONDS);
  });

  // 例題終了（本番前の待機に戻る）
  socket.on("endPractice", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (!eventState.isPractice) {
      return;
    }
    endPracticePhase();
    broadcastState();
  });

  // 次の問題へ（本番）
  socket.on("nextQuestion", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    // 例題中は本番問題へ進めない
    if (eventState.isPractice) {
      return;
    }
    stopTimer();

    const nextIndex = eventState.currentQuestionIndex + 1;
    if (nextIndex >= questions.length) {
      return;
    }

    // 次問へ進む前に、いまの出題済み問題を履歴へ残す
    recordCurrentQuestionToHistory();

    const question = questions[nextIndex];

    eventState.isPractice = false;
    eventState.currentQuestionIndex = nextIndex;
    eventState.currentQuestion = toPublicQuestion(question);
    eventState.currentQuestionId = question.id;
    eventState.surveyImageUrl = null;
    eventState.status = "question";
    eventState.hasQuestionStarted = true;
    eventState.answers = {};
    eventState.answeredCount = 0;
    eventState.revealedAnswers = [];
    eventState.correctAnswer = null;
    refreshDerivedFields();

    // デフォルト制限時間（3分）
    startTimer(QUESTION_TIME_SECONDS);
  });

  // 回答送信
  socket.on("submitAnswer", (answerValue) => {
    if (eventState.status !== "question") {
      socket.emit("answerResult", {
        success: false,
        message: "今は回答できません"
      });
      return;
    }

    const team = eventState.teams.find((team) => team.id === socket.id);
    if (!team) {
      socket.emit("answerResult", {
        success: false,
        message: "先にチーム参加してください"
      });
      return;
    }

    if (eventState.answers[socket.id] !== undefined) {
      socket.emit("answerResult", {
        success: false,
        message: "この問題にはすでに回答済みです"
      });
      return;
    }

    const answer = Number(answerValue);

    if (!Number.isInteger(answer) || answer < 0 || answer > 100) {
      socket.emit("answerResult", {
        success: false,
        message: "0〜100の整数で入力してください"
      });
      return;
    }

    eventState.answers[socket.id] = answer;
    eventState.answeredCount = Object.keys(eventState.answers).length;

    socket.emit("answerResult", {
      success: true,
      message: `回答 ${answer}% を受け付けました`
    });

    // 全チームが回答したら自動で受付終了
    if (
      eventState.teams.length > 0 &&
      eventState.answeredCount >= eventState.teams.length
    ) {
      closeAnswerPhase();
    }

    broadcastState();
  });

  // 回答受付終了
  socket.on("closeAnswers", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.status === "question") {
      closeAnswerPhase();
      broadcastState();
    }
  });

  // 残り時間を延長
  socket.on("extendTime", (seconds) => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.status !== "question" || eventState.remainingTime === null) {
      return;
    }

    const extendSeconds = Number(seconds);
    if (!Number.isInteger(extendSeconds) || extendSeconds <= 0) {
      return;
    }

    eventState.remainingTime += extendSeconds;
    broadcastState();
  });

  // 回答公開（例題では使わない）
  socket.on("revealAnswers", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.isPractice) {
      return;
    }
    if (eventState.status !== "answer_closed") {
      return;
    }

    eventState.revealedAnswers = buildRevealedAnswers();
    eventState.status = "answers_revealed";
    broadcastState();
  });

  // 正解発表（例題では使わない）
  socket.on("revealCorrectAnswer", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.isPractice) {
      return;
    }
    if (eventState.status !== "answers_revealed") {
      return;
    }

    const question = questions[eventState.currentQuestionIndex];
    eventState.correctAnswer = question.correctAnswer;
    updateScores();
    eventState.status = "correct_revealed";
    broadcastState();
  });

  // アンケート結果公開（問題に紐づいた画像をセット）
  socket.on("showSurveyResults", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.isPractice) {
      return;
    }
    if (eventState.status !== "correct_revealed") {
      return;
    }

    const question = questions[eventState.currentQuestionIndex];
    eventState.surveyImageUrl =
      (question && question.surveyImage) ||
      (eventState.currentQuestion && eventState.currentQuestion.surveyImage) ||
      null;
    eventState.status = "survey_results";
    eventState.revealedAnswers = buildRevealedAnswers();
    broadcastState();
  });

  // 順位発表（問題ごとの順位一覧）
  socket.on("showRanking", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.status !== "survey_results") {
      return;
    }

    eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);
    eventState.status = "ranking_revealed";
    broadcastState();
  });

  // 結果発表（1〜3位のセレモニー。正解発表／アンケート／順位発表から遷移可）
  socket.on("showResults", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.isPractice) {
      return;
    }
    const allowed = [
      "correct_revealed",
      "survey_results",
      "ranking_revealed"
    ];
    if (!allowed.includes(eventState.status)) {
      return;
    }

    eventState.surveyImageUrl = null;
    eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);
    eventState.resultsRevealStep = 0;
    eventState.status = "results_announced";
    broadcastState();
  });

  // 結果発表：次の順位（3位→2位→1位）を1つ公開する
  socket.on("revealNextResult", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.status !== "results_announced") {
      return;
    }

    const maxStep = Math.min(3, eventState.ranking.length);
    if (eventState.resultsRevealStep >= maxStep) {
      return;
    }

    eventState.resultsRevealStep += 1;
    broadcastState();
  });

  // 参加受付へ戻す（まだ問題を出していない開始直後のみ）
  socket.on("reopenJoinPhase", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.status === "waiting" || eventState.hasQuestionStarted) {
      return;
    }

    reopenJoinPhase();
    broadcastState();
  });

  // イベント終了（順位などの結果を残す）
  socket.on("finishEvent", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    if (eventState.status === "waiting" || eventState.status === "finished") {
      return;
    }
    finishEventKeepResults();
    broadcastState();
  });

  // 新規イベント用に完全リセット（終了後など）
  socket.on("resetEvent", () => {
    if (!isAdminSocket(socket)) {
      return;
    }
    resetEventState();
    broadcastState();
  });

  // 切断時：チームは残し、オフライン印だけ付ける（再接続できるようにする）
  socket.on("disconnect", () => {
    const team = eventState.teams.find((t) => t.id === socket.id);
    if (team) {
      team.online = false;
      eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);
      broadcastState();
    }
  });
});

// サーバー起動
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
