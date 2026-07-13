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

// publicフォルダの中身をそのまま配信する
app.use(express.static(path.join(__dirname, "public")));

// dataフォルダの中身をそのまま配信する
app.use(express.static(path.join(__dirname, "data")));

// 問題データをJSONファイルから読み込む
const questions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "questions.json"), "utf-8")
);

// タイマー停止用にsetIntervalのIDを保持する
let timerInterval = null;

// イベント全体の状態をまとめて管理する
const eventState = {
  status: "waiting", // waiting / started / question / answer_closed / answers_revealed / correct_revealed / survey_results / finished
  teams: [], // 参加チーム一覧
  hasQuestionStarted: false, // 1度でも問題を出したか
  currentQuestionIndex: -1, // 現在の問題番号（配列index）
  currentQuestion: null, // 画面表示用の現在問題
  currentQuestionId: null, // 問題切り替え判定用ID
  answers: {}, // { socket.id: answer }
  answeredCount: 0, // 回答済み件数
  remainingTime: null, // タイマー残り秒数
  revealedAnswers: [], // 公開用の回答一覧
  correctAnswer: null, // 公開された正解
  ranking: [] // 現在の順位表
};

// 全クライアントへ最新状態を送る
function broadcastState() {
  io.emit("stateUpdated", eventState);
}

// タイマー停止
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// イベント状態を初期状態へ戻す
function resetEventState() {
  stopTimer();
  eventState.status = "waiting";
  eventState.hasQuestionStarted = false;
  eventState.currentQuestionIndex = -1;
  eventState.currentQuestion = null;
  eventState.currentQuestionId = null;
  eventState.answers = {};
  eventState.answeredCount = 0;
  eventState.remainingTime = null;
  eventState.revealedAnswers = [];
  eventState.correctAnswer = null;
  eventState.ranking = [];
}

// 参加受付状態へ戻す
function reopenJoinPhase() {
  stopTimer();
  eventState.status = "waiting";
  eventState.hasQuestionStarted = false;
  eventState.currentQuestionIndex = -1;
  eventState.currentQuestion = null;
  eventState.currentQuestionId = null;
  eventState.answers = {};
  eventState.answeredCount = 0;
  eventState.remainingTime = null;
  eventState.revealedAnswers = [];
  eventState.correctAnswer = null;
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

    // 0秒になったら回答受付終了
    if (eventState.remainingTime <= 0) {
      eventState.remainingTime = 0;
      eventState.status = "answer_closed";
      stopTimer();
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

// ブラウザ接続時の処理
io.on("connection", (socket) => {
  // 接続した画面へ現在状態を送る
  socket.emit("stateUpdated", eventState);

  // チーム参加
  socket.on("joinTeam", (teamName) => {
    const trimmedName = String(teamName || "").trim();

    if (!trimmedName) {
      socket.emit("joinResult", {
        success: false,
        message: "チーム名を入力してください"
      });
      return;
    }

    const exists = eventState.teams.some((team) => team.name === trimmedName);
    if (exists) {
      socket.emit("joinResult", {
        success: false,
        message: "そのチーム名はすでに使われています"
      });
      return;
    }

    const team = {
      id: socket.id,
      name: trimmedName,
      score: 100
    };

    eventState.teams.push(team);
    eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);

    socket.emit("joinResult", {
      success: true,
      message: `チーム「${trimmedName}」で参加しました`,
      team
    });

    broadcastState();
  });

  // イベント開始
  socket.on("startEvent", () => {
    if (eventState.status !== "waiting") {
      return;
    }

    if (eventState.teams.length < 1) {
      socket.emit("joinResult", {
        success: false,
        message: "参加チームが1つ以上必要です"
      });
      return;
    }

    eventState.status = "started";
    broadcastState();
  });

  // 次の問題へ
  socket.on("nextQuestion", () => {
    stopTimer();

    const nextIndex = eventState.currentQuestionIndex + 1;
    if (nextIndex >= questions.length) {
      return;
    }

    const question = questions[nextIndex];

    eventState.currentQuestionIndex = nextIndex;
    eventState.currentQuestion = {
      id: question.id,
      questionText: question.questionText
    };
    eventState.currentQuestionId = question.id;
    eventState.status = "question";
    eventState.hasQuestionStarted = true;
    eventState.answers = {};
    eventState.answeredCount = 0;
    eventState.revealedAnswers = [];
    eventState.correctAnswer = null;

    // いったん30秒固定
    startTimer(30);
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

    broadcastState();
  });

  // 回答受付終了
  socket.on("closeAnswers", () => {
    if (eventState.status === "question") {
      eventState.status = "answer_closed";
      eventState.remainingTime = 0;
      stopTimer();
      broadcastState();
    }
  });

  // 残り時間を延長
  socket.on("extendTime", (seconds) => {
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

  // 回答公開
  socket.on("revealAnswers", () => {
    if (eventState.status !== "answer_closed") {
      return;
    }

    eventState.revealedAnswers = buildRevealedAnswers();
    eventState.status = "answers_revealed";
    broadcastState();
  });

  // 正解発表
  socket.on("revealCorrectAnswer", () => {
    if (eventState.status !== "answers_revealed") {
      return;
    }

    const question = questions[eventState.currentQuestionIndex];
    eventState.correctAnswer = question.correctAnswer;
    updateScores();
    eventState.status = "correct_revealed";
    broadcastState();
  });

  // アンケート結果公開
  socket.on("showSurveyResults", () => {
    if (eventState.status !== "correct_revealed") {
      return;
    }

    eventState.status = "survey_results";
    eventState.revealedAnswers = buildRevealedAnswers();
    broadcastState();
  });

  // 参加受付へ戻す
  socket.on("reopenJoinPhase", () => {
    if (eventState.status === "waiting" || eventState.hasQuestionStarted) {
      return;
    }

    reopenJoinPhase();
    broadcastState();
  });

  // イベント終了
  socket.on("finishEvent", () => {
    resetEventState();
    broadcastState();
  });

  // 切断時
  socket.on("disconnect", () => {
    eventState.teams = eventState.teams.filter((team) => team.id !== socket.id);

    if (eventState.answers[socket.id] !== undefined) {
      delete eventState.answers[socket.id];
      eventState.answeredCount = Object.keys(eventState.answers).length;
    }

    eventState.ranking = [...eventState.teams].sort((a, b) => b.score - a.score);
    broadcastState();
  });
});

// サーバー起動
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});