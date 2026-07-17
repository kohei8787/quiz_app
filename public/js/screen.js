// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const teamList = document.getElementById("teamList");
const waitingTitle = document.getElementById("waitingTitle");
const currentQuestionText = document.getElementById("currentQuestionText");
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const gaugeContainer = document.getElementById("gaugeContainer");
const rankingList = document.getElementById("rankingList");
const rankingTitle = document.getElementById("rankingTitle");
const waitingSection = document.getElementById("waitingSection");
const questionView = document.getElementById("questionView");
const resultView = document.getElementById("resultView");
const surveyResultsView = document.getElementById("surveyResultsView");
const rankingView = document.getElementById("rankingView");
const finishedView = document.getElementById("finishedView");
const finishedRankingList = document.getElementById("finishedRankingList");
const resultsView = document.getElementById("resultsView");
const podium = document.getElementById("podium");
const resultTitle = document.getElementById("resultTitle");
const surveyImage = document.getElementById("surveyImage");

// 結果発表の公開段階（管理者が操作）
let lastResultsRevealStep = -1;

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

  const showWaiting = state.status === "waiting";
  const showQuestionView =
    state.status === "question" ||
    state.status === "answer_closed" ||
    state.status === "started";
  const showResultView =
    state.status === "answers_revealed" || state.status === "correct_revealed";
  const showSurveyResultsView = state.status === "survey_results";
  const showRankingView = state.status === "ranking_revealed";
  const showResultsView = state.status === "results_announced";
  // イベント終了：参加受付ではなくお礼画面を表示
  const showFinishedView = state.status === "finished";

  waitingSection.style.display = showWaiting ? "block" : "none";
  questionView.style.display = showQuestionView ? "block" : "none";
  resultView.style.display = showResultView ? "block" : "none";
  surveyResultsView.style.display = showSurveyResultsView ? "block" : "none";
  rankingView.style.display = showRankingView ? "block" : "none";
  resultsView.style.display = showResultsView ? "block" : "none";
  finishedView.style.display = showFinishedView ? "block" : "none";

  if (state.surveyImageUrl) {
    surveyImage.src = state.surveyImageUrl;
  }

  if (state.status === "waiting") {
    statusEl.textContent = "参加受付中";
    waitingTitle.textContent = "参加受付中";
    currentQuestionText.textContent = "出題を待っています";
    timerText.textContent = "残り時間: --:--";
    correctAnswerText.textContent = "正解: --";
    gaugeContainer.innerHTML = "";
  } else if (state.status === "question" || state.status === "answer_closed") {
    statusEl.textContent = state.isPractice
      ? state.status === "answer_closed"
        ? "例題：回答受付終了"
        : "例題：回答受付中"
      : "問題表示";
  } else if (state.status === "answers_revealed") {
    statusEl.textContent = "回答公開";
  } else if (state.status === "correct_revealed") {
    statusEl.textContent = "正解発表";
  } else if (state.status === "survey_results") {
    statusEl.textContent = "アンケート結果公開";
  } else if (state.status === "ranking_revealed") {
    statusEl.textContent = "順位発表";
    rankingTitle.textContent = "順位発表";
  } else if (state.status === "results_announced") {
    statusEl.textContent = "結果発表";
  } else if (state.status === "finished") {
    statusEl.textContent = "イベント終了";
  } else {
    statusEl.textContent = "イベント進行中";
  }

  if (
    state.status !== "waiting" &&
    state.status !== "finished" &&
    state.status !== "results_announced"
  ) {
    currentQuestionText.textContent = state.currentQuestion
      ? state.currentQuestion.questionText
      : "出題を待っています";

    timerText.textContent = formatRemainingTime(state.remainingTime);

    // 例題では正解を表示しない
    if (state.isPractice) {
      correctAnswerText.textContent = "例題（正解発表なし）";
    } else {
      correctAnswerText.textContent =
        state.correctAnswer !== null
          ? `正解: ${state.correctAnswer}%`
          : "正解: --";
    }
  }

  if (state.status === "answers_revealed") {
    resultTitle.textContent = "回答公開";
  } else if (state.status === "correct_revealed") {
    resultTitle.textContent = "正解発表";
  }

  if (showResultView) {
    renderGauge(state);
  }

  // 途中の順位発表
  renderRanking(rankingList, state, state.status === "ranking_revealed");
  // 結果発表（1〜3位）
  renderPodium(state, showResultsView);
  // 終了画面の最終順位
  renderRanking(finishedRankingList, state, state.status === "finished");
});

function renderRanking(listEl, state, shouldShow) {
  listEl.innerHTML = "";

  if (!shouldShow) {
    return;
  }

  state.ranking.forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}位 ${team.name} - ${team.score}点`;
    listEl.appendChild(li);
  });
}

function renderPodium(state, shouldShow) {
  if (!shouldShow) {
    podium.innerHTML = "";
    lastResultsRevealStep = -1;
    return;
  }

  const topTeams = (state.ranking || []).slice(0, 3);
  const step = state.resultsRevealStep || 0;
  const revealOrder = [3, 2, 1].filter((place) => place <= topTeams.length);
  const revealedPlaces = new Set(revealOrder.slice(0, step));
  const previouslyRevealed = new Set(
    revealOrder.slice(0, Math.max(0, lastResultsRevealStep))
  );
  lastResultsRevealStep = step;

  podium.innerHTML = "";

  if (topTeams.length === 0) {
    const empty = document.createElement("p");
    empty.className = "podium-empty";
    empty.textContent = "表示できるチームがありません";
    podium.appendChild(empty);
    return;
  }

  if (step === 0) {
    const waiting = document.createElement("p");
    waiting.className = "podium-empty";
    waiting.textContent = "上位表彰の発表をお待ちください";
    podium.appendChild(waiting);
    return;
  }

  const displayOrder = [1, 0, 2].filter((index) => index < topTeams.length);

  displayOrder.forEach((rankIndex) => {
    const team = topTeams[rankIndex];
    const place = rankIndex + 1;
    const item = document.createElement("div");
    item.className = `podium-place podium-place--${place}`;

    if (!revealedPlaces.has(place)) {
      item.classList.add("podium-place--hidden");
      item.innerHTML = `
        <p class="podium-name">？</p>
        <p class="podium-score">--</p>
        <div class="podium-block">
          <span class="podium-rank">${place}</span>
        </div>
      `;
      podium.appendChild(item);
      return;
    }

    item.innerHTML = `
      <p class="podium-name"></p>
      <p class="podium-score"></p>
      <div class="podium-block">
        <span class="podium-rank">${place}</span>
      </div>
    `;
    item.querySelector(".podium-name").textContent = team.name;
    item.querySelector(".podium-score").textContent = `${team.score} pt`;

    if (previouslyRevealed.has(place)) {
      item.classList.add("is-visible");
    }

    podium.appendChild(item);
  });

  requestAnimationFrame(() => {
    podium.querySelectorAll(".podium-place:not(.podium-place--hidden)").forEach((el) => {
      if (!el.classList.contains("is-visible")) {
        el.classList.add("is-visible");
      }
    });
  });
}

function renderGauge(state) {
  gaugeContainer.innerHTML = "";

  if (!state.revealedAnswers || state.revealedAnswers.length === 0) {
    return;
  }

  const showCorrectPin = state.status === "correct_revealed";
  const showDetails = state.status === "answers_revealed";
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
  scale.innerHTML = "<span>0%</span><span>50%</span><span>100%</span>";
  gaugeContainer.appendChild(scale);
}
