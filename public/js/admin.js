// サーバーへ接続
const socket = io();

// 画面要素を取得
const adminLoginOverlay = document.getElementById("adminLoginOverlay");
const adminMain = document.getElementById("adminMain");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminLoginButton = document.getElementById("adminLoginButton");
const adminLoginMessage = document.getElementById("adminLoginMessage");

const statusEl = document.getElementById("status");
const startEventButton = document.getElementById("startEventButton");
const startPracticeButton = document.getElementById("startPracticeButton");
const endPracticeButton = document.getElementById("endPracticeButton");
const nextQuestionButton = document.getElementById("nextQuestionButton");
const closeAnswersButton = document.getElementById("closeAnswersButton");
const revealAnswersButton = document.getElementById("revealAnswersButton");
const revealCorrectAnswerButton = document.getElementById("revealCorrectAnswerButton");
const showSurveyResultsButton = document.getElementById("showSurveyResultsButton");
const showRankingButton = document.getElementById("showRankingButton");
const showResultsButton = document.getElementById("showResultsButton");
const reopenJoinPhaseButton = document.getElementById("reopenJoinPhaseButton");
const finishEventButton = document.getElementById("finishEventButton");
const resetEventButton = document.getElementById("resetEventButton");
const extendTimeInput = document.getElementById("extendTimeInput");
const extendTimeButton = document.getElementById("extendTimeButton");
const currentQuestionText = document.getElementById("currentQuestionText");
const questionProgressText = document.getElementById("questionProgressText");
const answeredCountText = document.getElementById("answeredCountText");
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const answerList = document.getElementById("answerList");
const rankingList = document.getElementById("rankingList");
const teamList = document.getElementById("teamList");
const answerStatusList = document.getElementById("answerStatusList");
const questionList = document.getElementById("questionList");

// 参加コード設定用の要素
const joinCodeInput = document.getElementById("joinCodeInput");
const setJoinCodeButton = document.getElementById("setJoinCodeButton");
const changeJoinCodeButton = document.getElementById("changeJoinCodeButton");
const cancelJoinCodeButton = document.getElementById("cancelJoinCodeButton");
const joinCodeMessage = document.getElementById("joinCodeMessage");
const currentJoinCodeText = document.getElementById("currentJoinCodeText");
const joinCodeEditArea = document.getElementById("joinCodeEditArea");
const joinCodeLockedArea = document.getElementById("joinCodeLockedArea");

// 残り時間を mm:ss 形式の文字列にする
function formatRemainingTime(seconds) {
  if (typeof seconds !== "number") {
    return "残り時間: --:--";
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return `残り時間: ${mm}:${ss}`;
}

// true のときだけ入力欄を表示して編集できる
let isEditingJoinCode = false;

// 最後にサーバーから受け取った参加コード（キャンセル時に戻す用）
let lastKnownJoinCode = "";

// ログイン済みかどうか（画面表示の切替用）
let isLoggedIn = false;

// タブを閉じるまでの間だけパスワードを覚えておく（再接続用）
const ADMIN_PASSWORD_KEY = "quizAdminPassword";

function getSavedAdminPassword() {
  try {
    return sessionStorage.getItem(ADMIN_PASSWORD_KEY) || "";
  } catch (e) {
    return "";
  }
}

function saveAdminPassword(password) {
  try {
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
  } catch (e) {
    // sessionStorage が使えない場合は無視
  }
}

function clearAdminPassword() {
  try {
    sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
  } catch (e) {
    // 無視
  }
}

function showAdminApp() {
  isLoggedIn = true;
  adminLoginOverlay.style.display = "none";
  adminMain.style.display = "block";
}

function showLoginGate(message) {
  isLoggedIn = false;
  adminLoginOverlay.style.display = "flex";
  adminMain.style.display = "none";
  if (message) {
    adminLoginMessage.textContent = message;
  }
}

// ログイン処理
function tryAdminLogin(password) {
  socket.emit("adminLogin", password);
}

socket.on("connect", () => {
  statusEl.textContent = "管理画面が接続されました";
  // 再接続時は保存済みパスワードで自動ログインを試みる
  const saved = getSavedAdminPassword();
  if (saved) {
    tryAdminLogin(saved);
  } else {
    showLoginGate("");
  }
});

socket.on("adminLoginResult", (result) => {
  if (result.success) {
    adminLoginMessage.textContent = "";
    showAdminApp();
    statusEl.textContent = result.message;
  } else {
    clearAdminPassword();
    showLoginGate(result.message);
  }
});

adminLoginButton.addEventListener("click", () => {
  const password = adminPasswordInput.value;
  if (!password) {
    adminLoginMessage.textContent = "パスワードを入力してください";
    return;
  }
  saveAdminPassword(password);
  tryAdminLogin(password);
});

// Enter キーでもログインできるようにする
adminPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    adminLoginButton.click();
  }
});

function updateJoinCodeUI(joinCode) {
  const hasCode = Boolean(joinCode);
  lastKnownJoinCode = joinCode || "";

  currentJoinCodeText.textContent = hasCode
    ? `現在の参加コード: ${joinCode}`
    : "現在の参加コード: （未設定）";

  if (hasCode && !isEditingJoinCode) {
    joinCodeEditArea.style.display = "none";
    joinCodeLockedArea.style.display = "block";
    cancelJoinCodeButton.style.display = "none";
    return;
  }

  joinCodeEditArea.style.display = "block";
  joinCodeLockedArea.style.display = "none";
  cancelJoinCodeButton.style.display = isEditingJoinCode ? "inline-block" : "none";

  if (hasCode && isEditingJoinCode && !joinCodeInput.value) {
    joinCodeInput.value = joinCode;
  }
}

function updateActionButtons(state) {
  const inPractice = Boolean(state.isPractice);
  const showStart = state.status === "waiting";
  // 例題：開始済みでまだ本番問題前のとき
  const showStartPractice =
    state.status === "started" && !state.hasQuestionStarted;
  // 例題中（回答受付中／受付終了後）は「例題を終了」を表示
  const showEndPractice =
    inPractice &&
    (state.status === "question" || state.status === "answer_closed");
  const canShowNext =
    !inPractice &&
    state.hasMoreQuestions &&
    (state.status === "started" ||
      state.status === "correct_revealed" ||
      state.status === "survey_results" ||
      state.status === "ranking_revealed");
  const showCloseAnswers = state.status === "question";
  // 例題では回答公開・正解発表へ進まない
  const showRevealAnswers = !inPractice && state.status === "answer_closed";
  const showRevealCorrectAnswer = !inPractice && state.status === "answers_revealed";
  const showSurveyResults = !inPractice && state.status === "correct_revealed";
  const showRanking = !inPractice && state.status === "survey_results";
  // 正解発表／アンケート／順位発表から結果発表（1〜3位）へ
  const showResults =
    !inPractice &&
    (state.status === "correct_revealed" ||
      state.status === "survey_results" ||
      state.status === "ranking_revealed");
  const showExtendTime = state.status === "question";
  const showReopenJoin =
    state.status === "started" && !state.hasQuestionStarted && !inPractice;
  // 結果発表後は終了ボタンで終了画面へ（進行中のほかの状態からも終了可）
  const showFinish = state.status !== "waiting" && state.status !== "finished";
  const showReset = state.status === "finished";

  startEventButton.style.display = showStart ? "inline-block" : "none";
  startPracticeButton.style.display = showStartPractice ? "inline-block" : "none";
  endPracticeButton.style.display = showEndPractice ? "inline-block" : "none";
  nextQuestionButton.style.display = canShowNext ? "inline-block" : "none";
  closeAnswersButton.style.display = showCloseAnswers ? "inline-block" : "none";
  revealAnswersButton.style.display = showRevealAnswers ? "inline-block" : "none";
  revealCorrectAnswerButton.style.display = showRevealCorrectAnswer ? "inline-block" : "none";
  showSurveyResultsButton.style.display = showSurveyResults ? "inline-block" : "none";
  showRankingButton.style.display = showRanking ? "inline-block" : "none";
  showResultsButton.style.display = showResults ? "inline-block" : "none";
  extendTimeInput.style.display = showExtendTime ? "inline-block" : "none";
  extendTimeButton.style.display = showExtendTime ? "inline-block" : "none";
  reopenJoinPhaseButton.style.display = showReopenJoin ? "inline-block" : "none";
  finishEventButton.style.display = showFinish ? "inline-block" : "none";
  resetEventButton.style.display = showReset ? "inline-block" : "none";
}

socket.on("stateUpdated", (state) => {
  // 未ログイン時は管理用の詳細表示を更新しない
  if (!isLoggedIn) {
    return;
  }

  if (state.status === "waiting") statusEl.textContent = "参加受付中";
  if (state.status === "started") statusEl.textContent = "開始済み（新規参加締切）";
  if (state.status === "question") {
    statusEl.textContent = state.isPractice ? "例題：回答受付中" : "回答受付中";
  }
  if (state.status === "answer_closed") {
    statusEl.textContent = state.isPractice
      ? "例題：回答受付終了（例題を終了できます）"
      : "回答受付終了";
  }
  if (state.status === "answers_revealed") statusEl.textContent = "回答公開中";
  if (state.status === "correct_revealed") statusEl.textContent = "正解発表中";
  if (state.status === "survey_results") statusEl.textContent = "アンケート結果公開";
  if (state.status === "ranking_revealed") statusEl.textContent = "順位発表中";
  if (state.status === "results_announced") statusEl.textContent = "結果発表中";
  if (state.status === "finished") statusEl.textContent = "イベント終了";

  updateActionButtons(state);

  const total = state.questionCount || 0;
  const current = state.currentQuestionNumber || 0;
  if (state.isPractice) {
    questionProgressText.textContent = "進捗: 例題（採点なし）";
  } else {
    questionProgressText.textContent =
      current > 0 ? `進捗: ${current} / ${total} 問目` : `進捗: 未出題（全${total}問）`;
  }

  currentQuestionText.textContent = state.currentQuestion
    ? state.currentQuestion.questionText
    : "まだ問題は表示されていません";

  answeredCountText.textContent = `回答済み: ${state.answeredCount} / ${state.teams.length}件`;

  timerText.textContent = formatRemainingTime(state.remainingTime);

  correctAnswerText.textContent =
    state.correctAnswer !== null ? `正解: ${state.correctAnswer}%` : "正解: --";

  updateJoinCodeUI(state.joinCode);

  questionList.innerHTML = "";
  (state.questionList || []).forEach((item, index) => {
    const li = document.createElement("li");
    const num = index + 1;
    li.textContent = `${num}. ${item.questionText}`;
    if (item.isCurrent) {
      li.className = "question-item-current";
    }
    questionList.appendChild(li);
  });

  teamList.innerHTML = "";
  state.teams.forEach((team) => {
    const li = document.createElement("li");
    const onlineLabel = team.online === false ? "・オフライン" : "";
    li.textContent = `${team.name}（座席: ${team.seatNumber || "--"}） - ${team.score}点${onlineLabel}`;
    if (team.online === false) {
      li.className = "team-offline";
    }
    teamList.appendChild(li);
  });

  answerStatusList.innerHTML = "";
  const statusRows = state.answerStatus || [];
  if (statusRows.length === 0) {
    const li = document.createElement("li");
    li.textContent = "参加チームがありません";
    answerStatusList.appendChild(li);
  } else {
    statusRows.forEach((row) => {
      const li = document.createElement("li");
      const answeredLabel = row.answered ? "回答済" : "未回答";
      const onlineLabel = row.online === false ? " / オフライン" : "";
      li.textContent = `${row.name}（座席: ${row.seatNumber || "--"}）: ${answeredLabel}${onlineLabel}`;
      li.className = row.answered ? "answer-status-done" : "answer-status-pending";
      answerStatusList.appendChild(li);
    });
  }

  answerList.innerHTML = "";
  state.revealedAnswers.forEach((item) => {
    const li = document.createElement("li");
    li.textContent =
      item.answer === null
        ? `${item.teamName}: 未回答`
        : `${item.teamName}: ${item.answer}%`;
    answerList.appendChild(li);
  });

  rankingList.innerHTML = "";
  state.ranking.forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}位 ${team.name} - ${team.score}点`;
    rankingList.appendChild(li);
  });
});

socket.on("joinCodeResult", (result) => {
  joinCodeMessage.textContent = result.message;
  if (result.success) {
    isEditingJoinCode = false;
    joinCodeInput.value = "";
    updateJoinCodeUI(result.joinCode);
  }
});

socket.on("startEventResult", (result) => {
  if (!result.success) {
    statusEl.textContent = result.message;
  }
});

setJoinCodeButton.addEventListener("click", () => {
  socket.emit("setJoinCode", joinCodeInput.value.trim());
});

changeJoinCodeButton.addEventListener("click", () => {
  isEditingJoinCode = true;
  joinCodeMessage.textContent = "";
  joinCodeInput.value = lastKnownJoinCode;
  updateJoinCodeUI(lastKnownJoinCode);
  joinCodeInput.focus();
});

cancelJoinCodeButton.addEventListener("click", () => {
  isEditingJoinCode = false;
  joinCodeInput.value = "";
  joinCodeMessage.textContent = "";
  updateJoinCodeUI(lastKnownJoinCode);
});

startEventButton.addEventListener("click", () => {
  socket.emit("startEvent");
});

startPracticeButton.addEventListener("click", () => {
  socket.emit("startPractice");
});

endPracticeButton.addEventListener("click", () => {
  socket.emit("endPractice");
});

nextQuestionButton.addEventListener("click", () => {
  socket.emit("nextQuestion");
});

closeAnswersButton.addEventListener("click", () => {
  socket.emit("closeAnswers");
});

revealAnswersButton.addEventListener("click", () => {
  socket.emit("revealAnswers");
});

revealCorrectAnswerButton.addEventListener("click", () => {
  socket.emit("revealCorrectAnswer");
});

showSurveyResultsButton.addEventListener("click", () => {
  socket.emit("showSurveyResults");
});

showRankingButton.addEventListener("click", () => {
  socket.emit("showRanking");
});

showResultsButton.addEventListener("click", () => {
  socket.emit("showResults");
});

extendTimeButton.addEventListener("click", () => {
  let seconds = parseInt(extendTimeInput.value, 10);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    seconds = 10;
  }
  socket.emit("extendTime", seconds);
});

reopenJoinPhaseButton.addEventListener("click", () => {
  socket.emit("reopenJoinPhase");
});

// 危険操作：確認ダイアログを出してから実行する
finishEventButton.addEventListener("click", () => {
  const ok = window.confirm(
    "イベントを終了しますか？\n終了画面（最終順位・出題レビュー）へ進みます。"
  );
  if (!ok) {
    return;
  }
  socket.emit("finishEvent");
});

resetEventButton.addEventListener("click", () => {
  const ok = window.confirm(
    "すべてのチーム・得点・進行状況を消して、最初からやり直します。\nよろしいですか？"
  );
  if (!ok) {
    return;
  }
  socket.emit("resetEvent");
});
