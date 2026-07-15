// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const joinCodeInput = document.getElementById("joinCodeInput");
const teamNameInput = document.getElementById("teamNameInput");
const seatNumberInput = document.getElementById("seatNumberInput");
const joinButton = document.getElementById("joinButton");
const editTeamButton = document.getElementById("editTeamButton");
const teamEditActions = document.getElementById("teamEditActions");
const confirmTeamButton = document.getElementById("confirmTeamButton");
const cancelTeamButton = document.getElementById("cancelTeamButton");
const joinMessage = document.getElementById("joinMessage");
const joinSectionTitle = document.getElementById("joinSectionTitle");
const currentQuestionText = document.getElementById("currentQuestionText");
const answerArea = document.getElementById("answerArea");
const answerInput = document.getElementById("answerInput");
const answerSlider = document.getElementById("answerSlider");
const sliderValue = document.getElementById("sliderValue");
const submitAnswerButton = document.getElementById("submitAnswerButton");
const answerMessage = document.getElementById("answerMessage");
const joinSection = document.getElementById("joinSection");
const questionView = document.getElementById("questionView");
const myTeamResult = document.getElementById("myTeamResult");
const resultView = document.getElementById("resultView");
const surveyResultsView = document.getElementById("surveyResultsView");
const rankingView = document.getElementById("rankingView");
const rankingList = document.getElementById("rankingList");
const myRankText = document.getElementById("myRankText");
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const scoreText = document.getElementById("scoreText");
const gaugeContainer = document.getElementById("gaugeContainer");
const resultTitle = document.getElementById("resultTitle");

// 問題切り替え判定用
let lastQuestionId = null;

// 自チーム名を保持してスコア表示に使う
let myTeamName = "";

// 参加済みかどうか
let hasJoined = false;

// チーム情報の編集中かどうか（「チーム情報を変更」押下後）
let isEditingTeamInfo = false;

// キャンセル時に戻すための保存値
let savedTeamName = "";
let savedSeatNumber = "";

// 直近のイベント状態（参加受付中かどうかの判定用）
let currentEventStatus = "waiting";

socket.on("connect", () => {
  statusEl.textContent = "参加者画面が接続されました";
});

// 参加フォームの表示を現在の状態に合わせて切り替える
function updateJoinFormMode() {
  const canEdit = currentEventStatus === "waiting" || currentEventStatus === "finished";

  if (!hasJoined) {
    // ===== 未参加：参加フォーム =====
    joinSectionTitle.textContent = "チーム参加";
    joinCodeInput.style.display = "block";
    joinCodeInput.disabled = false;
    teamNameInput.disabled = false;
    seatNumberInput.disabled = false;
    joinButton.style.display = "block";
    editTeamButton.style.display = "none";
    teamEditActions.style.display = "none";
    return;
  }

  // ===== 参加済み =====
  joinSectionTitle.textContent = "チーム情報";
  joinCodeInput.style.display = "none";
  joinButton.style.display = "none";

  // イベント開始後は編集不可（入力ロック＋変更ボタン非表示）
  if (!canEdit) {
    isEditingTeamInfo = false;
    teamNameInput.disabled = true;
    seatNumberInput.disabled = true;
    editTeamButton.style.display = "none";
    teamEditActions.style.display = "none";
    return;
  }

  if (isEditingTeamInfo) {
    // 編集モード：入力可能＋決定／キャンセル
    teamNameInput.disabled = false;
    seatNumberInput.disabled = false;
    editTeamButton.style.display = "none";
    teamEditActions.style.display = "flex";
  } else {
    // ロックモード：入力不可＋「チーム情報を変更」
    teamNameInput.disabled = true;
    seatNumberInput.disabled = true;
    editTeamButton.style.display = "block";
    teamEditActions.style.display = "none";
  }
}

// 参加ボタン
joinButton.addEventListener("click", () => {
  socket.emit("joinTeam", {
    teamName: teamNameInput.value.trim(),
    seatNumber: seatNumberInput.value.trim(),
    joinCode: joinCodeInput.value.trim()
  });
});

// 「チーム情報を変更」→ 編集モードへ（現在値を退避）
editTeamButton.addEventListener("click", () => {
  savedTeamName = teamNameInput.value;
  savedSeatNumber = seatNumberInput.value;
  isEditingTeamInfo = true;
  joinMessage.textContent = "";
  updateJoinFormMode();
  teamNameInput.focus();
});

// 「決定」→ サーバーへ更新を送る
confirmTeamButton.addEventListener("click", () => {
  socket.emit("updateTeamInfo", {
    teamName: teamNameInput.value.trim(),
    seatNumber: seatNumberInput.value.trim()
  });
});

// 「キャンセル」→ 編集前の値に戻してロック
cancelTeamButton.addEventListener("click", () => {
  teamNameInput.value = savedTeamName;
  seatNumberInput.value = savedSeatNumber;
  isEditingTeamInfo = false;
  joinMessage.textContent = "";
  updateJoinFormMode();
});

// 参加結果受信
socket.on("joinResult", (result) => {
  joinMessage.textContent = result.message;

  if (result.success) {
    myTeamName = result.team.name;
    hasJoined = true;
    isEditingTeamInfo = false;
    savedTeamName = teamNameInput.value;
    savedSeatNumber = seatNumberInput.value;
    updateJoinFormMode();
  }
});

// チーム情報の更新結果受信
socket.on("updateTeamResult", (result) => {
  joinMessage.textContent = result.message;

  if (result.success) {
    myTeamName = result.team.name;
    savedTeamName = teamNameInput.value;
    savedSeatNumber = seatNumberInput.value;
    isEditingTeamInfo = false;
    updateJoinFormMode();
  }
});

// 状態更新受信
socket.on("stateUpdated", (state) => {
  // 問題が切り替わった時だけ入力欄やメッセージを初期化
  if (state.currentQuestionId !== lastQuestionId) {
    lastQuestionId = state.currentQuestionId;
    answerMessage.textContent = "";
    answerInput.value = "";
    answerSlider.value = 50;
    sliderValue.textContent = "50";
    answerInput.disabled = false;
    answerSlider.disabled = false;
    submitAnswerButton.disabled = false;
    gaugeContainer.innerHTML = "";
    myTeamResult.style.display = "none";
    myTeamResult.textContent = "";
  }

  const isWaiting = state.status === "waiting" || state.status === "finished";
  const showQuestionView = state.status === "question" || state.status === "answer_closed" || state.status === "started";
  const showResultView = state.status === "answers_revealed" || state.status === "correct_revealed";
  const showSurveyResultsView = state.status === "survey_results";
  const showRankingView = state.status === "ranking_revealed";

  currentEventStatus = state.status;

  // 参加受付中のみ参加／チーム情報エリアを表示
  // （イベント開始後は変更不可なのでこのエリアは隠す）
  joinSection.style.display = isWaiting ? "block" : "none";
  questionView.style.display = showQuestionView ? "block" : "none";
  resultView.style.display = showResultView ? "block" : "none";
  surveyResultsView.style.display = showSurveyResultsView ? "block" : "none";
  rankingView.style.display = showRankingView ? "block" : "none";

  // イベント終了などでチームが消えたら参加状態をリセット
  if (isWaiting && hasJoined) {
    const stillInTeams = state.teams.some((team) => team.name === myTeamName);
    if (!stillInTeams) {
      hasJoined = false;
      myTeamName = "";
      isEditingTeamInfo = false;
      joinMessage.textContent = "";
      teamNameInput.value = "";
      seatNumberInput.value = "";
      joinCodeInput.value = "";
    }
  }

  // 参加フォームのロック／編集表示を最新状態に合わせる
  updateJoinFormMode();

  // 状態ごとの表示切り替え
  if (state.status === "question") {
    statusEl.textContent = "問題に回答してください";
    answerArea.style.display = "block";
  } else if (state.status === "answer_closed") {
    statusEl.textContent = "回答受付は終了しました";
    answerArea.style.display = "block";
    answerInput.disabled = true;
    answerSlider.disabled = true;
    submitAnswerButton.disabled = true;
  } else if (state.status === "answers_revealed") {
    statusEl.textContent = "全チームの回答を表示中";
    answerArea.style.display = "none";
    resultTitle.textContent = "回答公開";
    myTeamResult.style.display = "none";
  } else if (state.status === "correct_revealed") {
    statusEl.textContent = "正解発表中";
    answerArea.style.display = "none";
    resultTitle.textContent = "正解発表";
    myTeamResult.style.display = "block";
  } else if (state.status === "survey_results") {
    statusEl.textContent = "アンケート結果公開中";
    answerArea.style.display = "none";
  } else if (state.status === "ranking_revealed") {
    statusEl.textContent = "順位発表中";
    answerArea.style.display = "none";
  } else if (state.status === "finished") {
    statusEl.textContent = "参加受付中";
    answerArea.style.display = "none";
    currentQuestionText.textContent = "まだ問題は表示されていません";
    timerText.textContent = "残り時間: --秒";
    correctAnswerText.textContent = "正解: --";
    gaugeContainer.innerHTML = "";
    resultTitle.textContent = "回答公開";
  } else if (state.status === "started") {
    statusEl.textContent = "イベント開始。出題を待っています";
    answerArea.style.display = "none";
  } else if (state.status === "waiting") {
    statusEl.textContent = "参加受付中";
    answerArea.style.display = "none";
  }

  if (state.status !== "waiting" && state.status !== "finished") {
    currentQuestionText.textContent = state.currentQuestion
      ? state.currentQuestion.questionText
      : "まだ問題は表示されていません";

    timerText.textContent =
      typeof state.remainingTime === "number"
        ? `残り時間: ${state.remainingTime}秒`
        : "残り時間: --秒";

    correctAnswerText.textContent =
      state.correctAnswer !== null ? `正解: ${state.correctAnswer}%` : "正解: --";
  }

  const myTeam = state.teams.find((team) => team.name === myTeamName);
  scoreText.textContent = myTeam
    ? `現在の得点: ${myTeam.score}点`
    : "現在の得点: --点";

  // ゲージは回答公開・正解発表のときだけ描画
  if (showResultView) {
    renderGauge(state, myTeam);
  }

  // 順位発表画面の描画
  renderRanking(state);
});

function renderRanking(state) {
  rankingList.innerHTML = "";

  if (state.status !== "ranking_revealed") {
    myRankText.textContent = "あなたの順位: --";
    return;
  }

  let myRank = null;

  state.ranking.forEach((team, index) => {
    const rank = index + 1;
    const li = document.createElement("li");
    li.textContent = `${rank}位 ${team.name} - ${team.score}点`;

    // 自チームの行を強調表示
    if (team.name === myTeamName) {
      li.className = "ranking-item-own";
      myRank = rank;
    }

    rankingList.appendChild(li);
  });

  myRankText.textContent =
    myRank !== null ? `あなたの順位: ${myRank}位` : "あなたの順位: --";
}

function renderGauge(state, myTeam) {
  gaugeContainer.innerHTML = "";
  myTeamResult.style.display = "none";
  myTeamResult.textContent = "";

  if (!state.revealedAnswers || state.revealedAnswers.length === 0) {
    return;
  }

  const showCorrectPin = state.status === "correct_revealed";
  const correctValue = state.correctAnswer !== null ? state.correctAnswer : 0;

  const wrapper = document.createElement("div");
  wrapper.className = "gauge-track-wrapper";

  const track = document.createElement("div");
  track.className = "gauge-track";

  const fill = document.createElement("div");
  fill.className = "gauge-fill";
  fill.style.width = "100%";
  track.appendChild(fill);

  wrapper.appendChild(track);

  let myAnswer = null;

  state.revealedAnswers.forEach((item) => {
    if (item.answer === null) {
      return;
    }

    const percent = Math.max(0, Math.min(100, item.answer));
    const pin = document.createElement("div");
    pin.className = item.teamName === myTeamName ? "gauge-pin own" : "gauge-pin";
    pin.style.left = `${percent}%`;
    wrapper.appendChild(pin);

    const label = document.createElement("div");
    label.className = "gauge-label";
    label.textContent = item.teamName;
    label.style.left = `${percent}%`;
    wrapper.appendChild(label);

    if (item.teamName === myTeamName) {
      myAnswer = item.answer;
    }
  });

  if (showCorrectPin) {
    const correctPin = document.createElement("div");
    correctPin.className = "gauge-pin correct";
    correctPin.style.left = "0%";

    const correctLabel = document.createElement("div");
    correctLabel.className = "gauge-label";
    correctLabel.textContent = `正解: ${correctValue}%`;
    correctLabel.style.left = `${correctValue}%`;

    wrapper.appendChild(correctPin);
    wrapper.appendChild(correctLabel);

    requestAnimationFrame(() => {
      correctPin.style.left = `${correctValue}%`;
    });
  }

  gaugeContainer.appendChild(wrapper);

  const scale = document.createElement("div");
  scale.className = "gauge-scale";
  scale.innerHTML = '<span>0%</span><span>50%</span><span>100%</span>';
  gaugeContainer.appendChild(scale);

  const showMyTeamResult = myTeam && state.status === "correct_revealed";
  if (showMyTeamResult) {
    const answerText = myAnswer !== null ? `${myAnswer}%` : "未回答";
    let scoreDeltaText = "";

    if (myAnswer !== null && state.correctAnswer !== null) {
      const diff = Math.abs(myAnswer - state.correctAnswer);
      let delta = -diff;
      if (myAnswer === state.correctAnswer) {
        delta += 50;
      }
      scoreDeltaText = `（この問題の得点: ${delta >= 0 ? "+" + delta : delta}点）`;
    }

    myTeamResult.textContent = `自チーム: ${myTeam.name} / 回答: ${answerText} ${scoreDeltaText}`;
    myTeamResult.style.display = "block";
  }
}

answerSlider.addEventListener("input", () => {
    const value = answerSlider.value;
    sliderValue.textContent = value;
    answerInput.value = value;
  });

  answerInput.addEventListener("input", () => {
    const value = answerInput.value;
    if (value === "") {
      return;
    }
    answerSlider.value = value;
    sliderValue.textContent = value;
  });

  // 回答送信
submitAnswerButton.addEventListener("click", () => {
  const answer = Number(answerInput.value);
  socket.emit("submitAnswer", answer);
});

// 回答受付結果
socket.on("answerResult", (result) => {
  answerMessage.textContent = result.message;

  if (result.success) {
    answerInput.disabled = true;
    submitAnswerButton.disabled = true;
  }
});