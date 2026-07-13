// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const teamNameInput = document.getElementById("teamNameInput");
const joinButton = document.getElementById("joinButton");
const joinMessage = document.getElementById("joinMessage");
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
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const scoreText = document.getElementById("scoreText");
const gaugeContainer = document.getElementById("gaugeContainer");
const resultTitle = document.getElementById("resultTitle");

// 問題切り替え判定用
let lastQuestionId = null;

// 自チーム名を保持してスコア表示に使う
let myTeamName = "";

socket.on("connect", () => {
  statusEl.textContent = "参加者画面が接続されました";
});

// 参加ボタン
joinButton.addEventListener("click", () => {
  const teamName = teamNameInput.value.trim();
  socket.emit("joinTeam", teamName);
});

// 参加結果受信
socket.on("joinResult", (result) => {
  joinMessage.textContent = result.message;

  if (result.success) {
    myTeamName = result.team.name;
    teamNameInput.disabled = true;
    joinButton.disabled = true;
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
  const showResultView = state.status === "answers_revealed" || state.status === "correct_revealed" || state.status === "survey_results";

  joinSection.style.display = isWaiting ? "block" : "none";
  questionView.style.display = showQuestionView ? "block" : "none";
  resultView.style.display = showResultView ? "block" : "none";

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
  } else if (state.status === "correct_revealed" || state.status === "survey_results") {
    statusEl.textContent = state.status === "survey_results" ? "アンケート結果公開中" : "正解発表中";
    answerArea.style.display = "none";
    resultTitle.textContent = "正解発表";
    myTeamResult.style.display = "block";
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

  renderGauge(state, myTeam);
});

function renderGauge(state, myTeam) {
  gaugeContainer.innerHTML = "";
  myTeamResult.style.display = "none";
  myTeamResult.textContent = "";

  if (!state.revealedAnswers || state.revealedAnswers.length === 0) {
    return;
  }

  const showCorrectPin = state.status === "correct_revealed" || state.status === "survey_results";
  const isStaticSurvey = state.status === "survey_results";
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
    correctPin.style.left = isStaticSurvey ? `${correctValue}%` : "0%";

    const correctLabel = document.createElement("div");
    correctLabel.className = "gauge-label";
    correctLabel.textContent = `正解: ${correctValue}%`;
    correctLabel.style.left = `${correctValue}%`;

    wrapper.appendChild(correctPin);
    wrapper.appendChild(correctLabel);

    if (!isStaticSurvey) {
      requestAnimationFrame(() => {
        correctPin.style.left = `${correctValue}%`;
      });
    }
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