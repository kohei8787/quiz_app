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
const extendTimeInput = document.getElementById("extendTimeInput");
const extendTimeButton = document.getElementById("extendTimeButton");
const currentQuestionText = document.getElementById("currentQuestionText");
const answeredCountText = document.getElementById("answeredCountText");
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const answerList = document.getElementById("answerList");
const rankingList = document.getElementById("rankingList");
const teamList = document.getElementById("teamList");

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
// （設定済みのあとに「コードを変更」を押すと true になる）
let isEditingJoinCode = false;

// 最後にサーバーから受け取った参加コード（キャンセル時に戻す用）
let lastKnownJoinCode = "";

// 接続成功時
socket.on("connect", () => {
  statusEl.textContent = "管理画面が接続されました";
  // 再接続時も管理者として登録し直す
  socket.emit("registerAsAdmin");
});

// 参加コード欄の表示切替
// - 未設定／編集中 → 入力欄を表示
// - 設定済みかつ編集中でない → 「設定済み」表示＋変更ボタン
function updateJoinCodeUI(joinCode) {
  const hasCode = Boolean(joinCode);
  lastKnownJoinCode = joinCode || "";

  currentJoinCodeText.textContent = hasCode
    ? `現在の参加コード: ${joinCode}`
    : "現在の参加コード: （未設定）";

  // 設定済みで、かつ変更モードでないときはロック表示
  if (hasCode && !isEditingJoinCode) {
    joinCodeEditArea.style.display = "none";
    joinCodeLockedArea.style.display = "block";
    cancelJoinCodeButton.style.display = "none";
    return;
  }

  // 未設定、または変更ボタンを押した直後は編集可能
  joinCodeEditArea.style.display = "block";
  joinCodeLockedArea.style.display = "none";

  // キャンセルは「変更モード中」だけ表示（初回設定時は不要）
  cancelJoinCodeButton.style.display = isEditingJoinCode ? "inline-block" : "none";

  // 変更モードのときは現在のコードを入力欄に入れておく
  if (hasCode && isEditingJoinCode && !joinCodeInput.value) {
    joinCodeInput.value = joinCode;
  }
}

function updateActionButtons(state) {
  const showStart = state.status === "waiting";
  // 次の問題へ：開始後・正解発表後・アンケート結果公開後・順位発表後
  const showNextQuestion =
    state.status === "started" ||
    state.status === "correct_revealed" ||
    state.status === "survey_results" ||
    state.status === "ranking_revealed";
  const showCloseAnswers = state.status === "question";
  const showRevealAnswers = state.status === "answer_closed";
  const showRevealCorrectAnswer = state.status === "answers_revealed";
  const showSurveyResults = state.status === "correct_revealed";
  // 順位発表：アンケート結果公開中のみ表示
  const showRanking = state.status === "survey_results";
  const showExtendTime = state.status === "question";
  const showReopenJoin = state.status === "started" && !state.hasQuestionStarted;
  const showFinish = state.status !== "waiting" && state.status !== "finished";

  startEventButton.style.display = showStart ? "inline-block" : "none";
  nextQuestionButton.style.display = showNextQuestion ? "inline-block" : "none";
  closeAnswersButton.style.display = showCloseAnswers ? "inline-block" : "none";
  revealAnswersButton.style.display = showRevealAnswers ? "inline-block" : "none";
  revealCorrectAnswerButton.style.display = showRevealCorrectAnswer ? "inline-block" : "none";
  showSurveyResultsButton.style.display = showSurveyResults ? "inline-block" : "none";
  showRankingButton.style.display = showRanking ? "inline-block" : "none";
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
  if (state.status === "ranking_revealed") statusEl.textContent = "順位発表中";
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

  // 参加コード欄の表示を更新（管理者のみ受信）
  updateJoinCodeUI(state.joinCode);

  // 参加チーム一覧（座席番号つき・管理者のみ）
  teamList.innerHTML = "";
  state.teams.forEach((team) => {
    const li = document.createElement("li");
    // 座席番号は管理者画面だけに表示する
    li.textContent = `${team.name}（座席: ${team.seatNumber || "--"}） - ${team.score}点`;
    teamList.appendChild(li);
  });

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

// 参加コード設定結果
socket.on("joinCodeResult", (result) => {
  joinCodeMessage.textContent = result.message;

  // 設定に成功したら編集モードを終了して「設定済み」表示にする
  if (result.success) {
    isEditingJoinCode = false;
    joinCodeInput.value = "";
    updateJoinCodeUI(result.joinCode);
  }
});

// 参加コードを設定する
setJoinCodeButton.addEventListener("click", () => {
  socket.emit("setJoinCode", joinCodeInput.value.trim());
});

// 「コードを変更」→ 入力欄を再表示して編集可能にする
changeJoinCodeButton.addEventListener("click", () => {
  isEditingJoinCode = true;
  joinCodeMessage.textContent = "";
  // 現在のコードを入力欄に入れて、書き換えやすくする
  joinCodeInput.value = lastKnownJoinCode;
  updateJoinCodeUI(lastKnownJoinCode);
  joinCodeInput.focus();
});

// 「キャンセル」→ 変更せずに設定済み表示へ戻す
cancelJoinCodeButton.addEventListener("click", () => {
  isEditingJoinCode = false;
  joinCodeInput.value = "";
  joinCodeMessage.textContent = "";
  updateJoinCodeUI(lastKnownJoinCode);
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
