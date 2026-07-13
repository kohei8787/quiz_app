// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const teamList = document.getElementById("teamList");
const currentQuestionText = document.getElementById("currentQuestionText");
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const gaugeContainer = document.getElementById("gaugeContainer");
const rankingList = document.getElementById("rankingList");
const waitingSection = document.getElementById("waitingSection");
const questionView = document.getElementById("questionView");
const resultView = document.getElementById("resultView");
const surveyResultsView = document.getElementById("surveyResultsView");
const resultTitle = document.getElementById("resultTitle");

socket.on("connect", () => {
  statusEl.textContent = "スクリーン画面が接続されました";
});

// 状態更新受信
socket.on("stateUpdated", (state) => {
  // 参加チーム一覧
  teamList.innerHTML = "";
  state.teams.forEach((team) => {
    const li = document.createElement("li");
    li.textContent = team.name;
    teamList.appendChild(li);
  });

  const isWaiting = state.status === "waiting" || state.status === "finished";
  const showQuestionView = state.status === "question" || state.status === "answer_closed" || state.status === "started";
  const showResultView = state.status === "answers_revealed" || state.status === "correct_revealed";
  const showSurveyResultsView = state.status === "survey_results";

  waitingSection.style.display = isWaiting ? "block" : "none";
  questionView.style.display = showQuestionView ? "block" : "none";
  resultView.style.display = showResultView ? "block" : "none";
  surveyResultsView.style.display = showSurveyResultsView ? "block" : "none";

  if (state.status === "waiting" || state.status === "finished") {
    statusEl.textContent = "参加受付中";
    currentQuestionText.textContent = "出題を待っています";
    timerText.textContent = "残り時間: --秒";
    correctAnswerText.textContent = "正解: --";
    gaugeContainer.innerHTML = "";
    rankingList.innerHTML = "";
  } else if (state.status === "question" || state.status === "answer_closed") {
    statusEl.textContent = "問題表示";
  } else if (state.status === "answers_revealed") {
    statusEl.textContent = "回答公開";
  } else if (state.status === "correct_revealed") {
    statusEl.textContent = "正解発表";
  } else if (state.status === "survey_results") {
    statusEl.textContent = "アンケート結果公開";
  } else {
    statusEl.textContent = "イベント進行中";
  }

  if (state.status !== "waiting" && state.status !== "finished") {
    currentQuestionText.textContent = state.currentQuestion
      ? state.currentQuestion.questionText
      : "出題を待っています";

    timerText.textContent =
      typeof state.remainingTime === "number"
        ? `残り時間: ${state.remainingTime}秒`
        : "残り時間: --秒";

    correctAnswerText.textContent =
      state.correctAnswer !== null ? `正解: ${state.correctAnswer}%` : "正解: --";
  }

  if (state.status === "answers_revealed") {
    resultTitle.textContent = "回答公開";
  } else if (state.status === "correct_revealed" || state.status === "finished") {
    resultTitle.textContent = "正解発表";
  }

  renderGauge(state);

  // 順位表はイベント終了時のみ表示
  rankingList.innerHTML = "";
  if (state.status === "finished") {
    state.ranking.forEach((team, index) => {
      const li = document.createElement("li");
      li.textContent = `${index + 1}位 ${team.name} - ${team.score}点`;
      rankingList.appendChild(li);
    });
  }
});

function renderGauge(state) {
  gaugeContainer.innerHTML = "";

  if (!state.revealedAnswers || state.revealedAnswers.length === 0) {
    return;
  }

  const showCorrectPin = state.status === "correct_revealed" || state.status === "survey_results";
  const showDetails = state.status === "answers_revealed";
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

  state.revealedAnswers.forEach((item) => {
    if (item.answer === null) {
      return;
    }

    const percent = Math.max(0, Math.min(100, item.answer));
    const pin = document.createElement("div");
    pin.className = "gauge-pin";
    pin.style.left = `${percent}%`;
    wrapper.appendChild(pin);

    if (showDetails) {
      const label = document.createElement("div");
      label.className = "gauge-label";
      label.textContent = item.teamName;
      label.style.left = `${percent}%`;
      wrapper.appendChild(label);

      const row = document.createElement("div");
      row.className = "result-team-row";
      row.innerHTML = `<span>${item.teamName}</span><span>${item.answer}%</span>`;
      gaugeContainer.appendChild(row);
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
}