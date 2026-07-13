// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const startEventButton = document.getElementById("startEventButton");
const nextQuestionButton = document.getElementById("nextQuestionButton");
const closeAnswersButton = document.getElementById("closeAnswersButton");
const revealAnswersButton = document.getElementById("revealAnswersButton");
const revealCorrectAnswerButton = document.getElementById("revealCorrectAnswerButton");
const showSurveyResultsButton = document.getElementById("showSurveyResultsButton");
const reopenJoinPhaseButton = document.getElementById("reopenJoinPhaseButton");
const finishEventButton = document.getElementById("finishEventButton");
const extendTimeInput = document.getElementById("extendTimeInput");
const extendTimeButton = document.getElementById("extendTimeButton");
const currentQuestionText = document.getElementById("currentQuestionText");
const answeredCountText = document.getElementById("answeredCountText");
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const answerList = document.getElementById("answerList");
const rankingList = document.getElementById("rankingList");

// 接続成功時
socket.on("connect", () => {
  statusEl.textContent = "管理画面が接続されました";
});

function updateActionButtons(state) {
  const showStart = state.status === "waiting";
  const showNextQuestion = state.status === "started" || state.status === "correct_revealed" || state.status === "survey_results";
  const showCloseAnswers = state.status === "question";
  const showRevealAnswers = state.status === "answer_closed";
  const showRevealCorrectAnswer = state.status === "answers_revealed";
  const showSurveyResults = state.status === "correct_revealed";
  const showExtendTime = state.status === "question";
  const showReopenJoin = state.status === "started" && !state.hasQuestionStarted;
  const showFinish = state.status !== "waiting" && state.status !== "finished";

  startEventButton.style.display = showStart ? "inline-block" : "none";
  nextQuestionButton.style.display = showNextQuestion ? "inline-block" : "none";
  closeAnswersButton.style.display = showCloseAnswers ? "inline-block" : "none";
  revealAnswersButton.style.display = showRevealAnswers ? "inline-block" : "none";
  revealCorrectAnswerButton.style.display = showRevealCorrectAnswer ? "inline-block" : "none";
  showSurveyResultsButton.style.display = showSurveyResults ? "inline-block" : "none";
  extendTimeInput.style.display = showExtendTime ? "inline-block" : "none";
  extendTimeButton.style.display = showExtendTime ? "inline-block" : "none";
  reopenJoinPhaseButton.style.display = showReopenJoin ? "inline-block" : "none";
  finishEventButton.style.display = showFinish ? "inline-block" : "none";
}

// 状態更新を受けたら画面を書き換える
socket.on("stateUpdated", (state) => {
  if (state.status === "waiting") statusEl.textContent = "参加受付中";
  if (state.status === "started") statusEl.textContent = "開始済み";
  if (state.status === "question") statusEl.textContent = "回答受付中";
  if (state.status === "answer_closed") statusEl.textContent = "回答受付終了";
  if (state.status === "answers_revealed") statusEl.textContent = "回答公開中";
  if (state.status === "correct_revealed") statusEl.textContent = "正解発表中";
  if (state.status === "survey_results") statusEl.textContent = "アンケート結果公開";
  if (state.status === "finished") statusEl.textContent = "イベント終了";

  updateActionButtons(state);

  currentQuestionText.textContent = state.currentQuestion
    ? state.currentQuestion.questionText
    : "まだ問題は表示されていません";

  answeredCountText.textContent = `回答済み: ${state.answeredCount}件`;

  timerText.textContent =
    typeof state.remainingTime === "number"
      ? `残り時間: ${state.remainingTime}秒`
      : "残り時間: --秒";

  correctAnswerText.textContent =
    state.correctAnswer !== null ? `正解: ${state.correctAnswer}%` : "正解: --";

  // 回答一覧を描画
  answerList.innerHTML = "";
  state.revealedAnswers.forEach((item) => {
    const li = document.createElement("li");
    li.textContent =
      item.answer === null
        ? `${item.teamName}: 未回答`
        : `${item.teamName}: ${item.answer}%`;
    answerList.appendChild(li);
  });

  // 順位表を描画
  rankingList.innerHTML = "";
  state.ranking.forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}位 ${team.name} - ${team.score}点`;
    rankingList.appendChild(li);
  });
});

// ボタン操作をサーバーへ送信
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