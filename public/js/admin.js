// サーバーへ接続
const socket = io();

// 管理画面として登録する（座席番号・参加コードを受け取れるようにする）
socket.emit("registerAsAdmin");

// 画面要素を取得
const statusEl = document.getElementById("status");
const startEventButton = document.getElementById("startEventButton");
const nextQuestionButton = document.getElementById("nextQuestionButton");
const closeAnswersButton = document.getElementById("closeAnswersButton");
const revealAnswersButton = document.getElementById("revealAnswersButton");
const revealCorrectAnswerButton = document.getElementById("revealCorrectAnswerButton");
const showSurveyResultsButton = document.getElementById("showSurveyResultsButton");
const showRankingButton = document.getElementById("showRankingButton");
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

// true のときだけ入力欄を表示して編集できる
let isEditingJoinCode = false;

// 最後にサーバーから受け取った参加コード（キャンセル時に戻す用）
let lastKnownJoinCode = "";

socket.on("connect", () => {
  statusEl.textContent = "管理画面が接続されました";
  socket.emit("registerAsAdmin");
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
  const showStart = state.status === "waiting";
  // 次の問題へ：次の問題が残っているときだけ
  const canShowNext =
    state.hasMoreQuestions &&
    (state.status === "started" ||
      state.status === "correct_revealed" ||
      state.status === "survey_results" ||
      state.status === "ranking_revealed");
  const showCloseAnswers = state.status === "question";
  const showRevealAnswers = state.status === "answer_closed";
  const showRevealCorrectAnswer = state.status === "answers_revealed";
  const showSurveyResults = state.status === "correct_revealed";
  const showRanking = state.status === "survey_results";
  const showExtendTime = state.status === "question";
  const showReopenJoin = state.status === "started" && !state.hasQuestionStarted;
  // 終了：進行中のみ（終了画面そのものは別ボタン）
  const showFinish = state.status !== "waiting" && state.status !== "finished";
  const showReset = state.status === "finished";

  startEventButton.style.display = showStart ? "inline-block" : "none";
  nextQuestionButton.style.display = canShowNext ? "inline-block" : "none";
  closeAnswersButton.style.display = showCloseAnswers ? "inline-block" : "none";
  revealAnswersButton.style.display = showRevealAnswers ? "inline-block" : "none";
  revealCorrectAnswerButton.style.display = showRevealCorrectAnswer ? "inline-block" : "none";
  showSurveyResultsButton.style.display = showSurveyResults ? "inline-block" : "none";
  showRankingButton.style.display = showRanking ? "inline-block" : "none";
  extendTimeInput.style.display = showExtendTime ? "inline-block" : "none";
  extendTimeButton.style.display = showExtendTime ? "inline-block" : "none";
  reopenJoinPhaseButton.style.display = showReopenJoin ? "inline-block" : "none";
  finishEventButton.style.display = showFinish ? "inline-block" : "none";
  resetEventButton.style.display = showReset ? "inline-block" : "none";
}

socket.on("stateUpdated", (state) => {
  if (state.status === "waiting") statusEl.textContent = "参加受付中";
  if (state.status === "started") statusEl.textContent = "開始済み（新規参加締切）";
  if (state.status === "question") statusEl.textContent = "回答受付中";
  if (state.status === "answer_closed") statusEl.textContent = "回答受付終了";
  if (state.status === "answers_revealed") statusEl.textContent = "回答公開中";
  if (state.status === "correct_revealed") statusEl.textContent = "正解発表中";
  if (state.status === "survey_results") statusEl.textContent = "アンケート結果公開";
  if (state.status === "ranking_revealed") statusEl.textContent = "順位発表中";
  if (state.status === "finished") statusEl.textContent = "イベント終了";

  updateActionButtons(state);

  const total = state.questionCount || 0;
  const current = state.currentQuestionNumber || 0;
  questionProgressText.textContent =
    current > 0 ? `進捗: ${current} / ${total} 問目` : `進捗: 未出題（全${total}問）`;

  currentQuestionText.textContent = state.currentQuestion
    ? state.currentQuestion.questionText
    : "まだ問題は表示されていません";

  answeredCountText.textContent = `回答済み: ${state.answeredCount} / ${state.teams.length}件`;

  timerText.textContent =
    typeof state.remainingTime === "number"
      ? `残り時間: ${state.remainingTime}秒`
      : "残り時間: --秒";

  correctAnswerText.textContent =
    state.correctAnswer !== null ? `正解: ${state.correctAnswer}%` : "正解: --";

  updateJoinCodeUI(state.joinCode);

  // 問題一覧
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

  // 参加チーム一覧
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

  // 回答状況（座席つき・管理者のみ）
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

  // 回答一覧（公開後）
  answerList.innerHTML = "";
  state.revealedAnswers.forEach((item) => {
    const li = document.createElement("li");
    li.textContent =
      item.answer === null
        ? `${item.teamName}: 未回答`
        : `${item.teamName}: ${item.answer}%`;
    answerList.appendChild(li);
  });

  // 順位表
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

finishEventButton.addEventListener("click", () => {
  socket.emit("finishEvent");
});

resetEventButton.addEventListener("click", () => {
  socket.emit("resetEvent");
});
