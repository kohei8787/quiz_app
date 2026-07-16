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
const surveyImage = document.getElementById("surveyImage");
const rankingTitle = document.getElementById("rankingTitle");
const currentQuestionText = document.getElementById("currentQuestionText");
const questionProgress = document.getElementById("questionProgress");
const questionBadgeNum = document.getElementById("questionBadgeNum");
const questionHint = document.getElementById("questionHint");
const answerArea = document.getElementById("answerArea");
const answerInput = document.getElementById("answerInput");
const answerSlider = document.getElementById("answerSlider");
const answerDecButton = document.getElementById("answerDecButton");
const answerIncButton = document.getElementById("answerIncButton");
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
const timerValue = document.getElementById("timerValue");
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

// 残り時間を「◯秒」形式にする（モックアップ準拠）
function formatRemainingTime(seconds) {
  if (typeof seconds !== "number") {
    return "--秒";
  }
  return `${seconds}秒`;
}

// 回答値を 0〜100 の整数に丸める
function clampAnswer(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.round(num)));
}

function setAnswerValue(value) {
  const next = clampAnswer(value);
  answerInput.value = String(next);
  answerSlider.value = String(next);
}

function setAnswerControlsEnabled(enabled) {
  answerInput.disabled = !enabled;
  answerSlider.disabled = !enabled;
  answerDecButton.disabled = !enabled;
  answerIncButton.disabled = !enabled;
  submitAnswerButton.disabled = !enabled;
}

function updateQuestionMeta(state) {
  const total = state.questionCount || 0;

  if (state.isPractice) {
    questionProgress.textContent = "例題";
    questionBadgeNum.textContent = "例題";
    questionHint.textContent = "操作確認です。0〜100%の好きな値を選んでください";
    return;
  }

  const current =
    typeof state.currentQuestionIndex === "number" &&
    state.currentQuestionIndex >= 0
      ? state.currentQuestionIndex + 1
      : null;

  if (current !== null && total > 0) {
    questionProgress.textContent = `第${current}問 / 全${total}問`;
    questionBadgeNum.textContent = `${current} / ${total}`;
  } else {
    questionProgress.textContent = total > 0 ? `全${total}問` : "第--問 / 全--問";
    questionBadgeNum.textContent = "-- / --";
  }

  questionHint.textContent = "0~100%の範囲で予測してください";
}

// 再接続用にブラウザへ保存するキー
const JOIN_STORAGE_KEY = "quizJoinInfo";

function saveJoinInfo(teamName, seatNumber, code) {
  try {
    localStorage.setItem(
      JOIN_STORAGE_KEY,
      JSON.stringify({ teamName, seatNumber, joinCode: code })
    );
  } catch (e) {
    // localStorage が使えない環境では無視
  }
}

function loadJoinInfo() {
  try {
    const raw = localStorage.getItem(JOIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearJoinInfo() {
  try {
    localStorage.removeItem(JOIN_STORAGE_KEY);
  } catch (e) {
    // 無視
  }
}

// 保存済み情報で再接続を試みる
function tryAutoReconnect() {
  if (hasJoined) {
    return;
  }
  const saved = loadJoinInfo();
  if (!saved || !saved.teamName || !saved.seatNumber || !saved.joinCode) {
    return;
  }
  joinCodeInput.value = saved.joinCode;
  teamNameInput.value = saved.teamName;
  seatNumberInput.value = saved.seatNumber;
  socket.emit("joinTeam", {
    teamName: saved.teamName,
    seatNumber: saved.seatNumber,
    joinCode: saved.joinCode
  });
}

socket.on("connect", () => {
  statusEl.textContent = "参加者画面が接続されました";
  // 回線切断後の再接続で、同じチームに自動で戻る
  tryAutoReconnect();
});

// 参加フォームの表示を現在の状態に合わせて切り替える
function updateJoinFormMode() {
  const canEdit = currentEventStatus === "waiting";
  const joinClosed = currentEventStatus !== "waiting" && !hasJoined;

  if (!hasJoined) {
    // ===== 未参加：参加フォーム =====
    joinSectionTitle.textContent = joinClosed
      ? "参加受付終了（再接続のみ）"
      : "チーム参加";
    joinCodeInput.style.display = "block";
    joinCodeInput.disabled = false;
    teamNameInput.disabled = false;
    seatNumberInput.disabled = false;
    joinButton.style.display = "block";
    joinButton.textContent = joinClosed ? "再接続" : "参加";
    editTeamButton.style.display = "none";
    teamEditActions.style.display = "none";
    return;
  }

  // ===== 参加済み =====
  joinSectionTitle.textContent = "チーム情報";
  joinCodeInput.style.display = "none";
  joinButton.style.display = "none";

  // イベント開始後は編集不可
  if (!canEdit) {
    isEditingTeamInfo = false;
    teamNameInput.disabled = true;
    seatNumberInput.disabled = true;
    editTeamButton.style.display = "none";
    teamEditActions.style.display = "none";
    return;
  }

  if (isEditingTeamInfo) {
    teamNameInput.disabled = false;
    seatNumberInput.disabled = false;
    editTeamButton.style.display = "none";
    teamEditActions.style.display = "flex";
  } else {
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
    saveJoinInfo(
      teamNameInput.value.trim(),
      seatNumberInput.value.trim(),
      joinCodeInput.value.trim()
    );
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
    saveJoinInfo(
      teamNameInput.value.trim(),
      seatNumberInput.value.trim(),
      (loadJoinInfo() && loadJoinInfo().joinCode) || joinCodeInput.value.trim()
    );
    updateJoinFormMode();
  }
});

// 状態更新受信
socket.on("stateUpdated", (state) => {
  // 問題が切り替わった時だけ入力欄やメッセージを初期化
  if (state.currentQuestionId !== lastQuestionId) {
    lastQuestionId = state.currentQuestionId;
    answerMessage.textContent = "";
    setAnswerValue(50);
    setAnswerControlsEnabled(true);
    gaugeContainer.innerHTML = "";
    myTeamResult.style.display = "none";
    myTeamResult.textContent = "";
  }

  const showJoinSection =
    state.status === "waiting" ||
    (!hasJoined && state.status !== "finished") ||
    (hasJoined && state.status === "waiting");
  const showQuestionView =
    state.status === "question" ||
    state.status === "answer_closed" ||
    state.status === "started";
  const showResultView =
    state.status === "answers_revealed" || state.status === "correct_revealed";
  const showSurveyResultsView = state.status === "survey_results";
  // 順位発表中、またはイベント終了時に最終順位を表示
  const showRankingView =
    state.status === "ranking_revealed" || state.status === "finished";

  currentEventStatus = state.status;

  // 出題・回答中はタイトルを隠してモックアップ寄りの画面にする
  document.body.classList.toggle(
    "answering",
    showQuestionView &&
      (state.status === "question" || state.status === "answer_closed")
  );

  joinSection.style.display = showJoinSection ? "block" : "none";
  questionView.style.display = showQuestionView ? "block" : "none";
  resultView.style.display = showResultView ? "block" : "none";
  surveyResultsView.style.display = showSurveyResultsView ? "block" : "none";
  rankingView.style.display = showRankingView ? "block" : "none";

  // リセット後など、チームがいなくなったら参加状態をクリア
  if (hasJoined) {
    const stillInTeams = state.teams.some((team) => team.name === myTeamName);
    if (!stillInTeams && state.status === "waiting") {
      hasJoined = false;
      myTeamName = "";
      isEditingTeamInfo = false;
      joinMessage.textContent = "";
      clearJoinInfo();
    }
  }

  // 参加フォームのロック／編集表示を最新状態に合わせる
  updateJoinFormMode();

  // アンケート画像を問題ごとに切り替え
  if (state.surveyImageUrl) {
    surveyImage.src = state.surveyImageUrl;
  }

  // 状態ごとの表示切り替え（例題は回答練習のみ。正解発表なし）
  if (state.status === "question") {
    statusEl.textContent = state.isPractice
      ? "【例題】操作確認：回答してください（採点・正解発表はありません）"
      : "問題に回答してください";
    answerArea.style.display = "block";
  } else if (state.status === "answer_closed") {
    statusEl.textContent = state.isPractice
      ? "【例題】回答受付は終了しました。本番の開始をお待ちください"
      : "回答受付は終了しました";
    answerArea.style.display = "block";
    setAnswerControlsEnabled(false);
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
    rankingTitle.textContent = "順位発表";
  } else if (state.status === "finished") {
    statusEl.textContent = "イベント終了";
    answerArea.style.display = "none";
    rankingTitle.textContent = "最終順位";
  } else if (state.status === "started") {
    statusEl.textContent = "イベント開始。例題または本番の出題を待っています";
    answerArea.style.display = "none";
  } else if (state.status === "waiting") {
    statusEl.textContent = "参加受付中";
    answerArea.style.display = "none";
  }

  if (state.status !== "waiting" && state.status !== "finished") {
    currentQuestionText.textContent = state.currentQuestion
      ? state.currentQuestion.questionText
      : "まだ問題は表示されていません";

    timerValue.textContent = formatRemainingTime(state.remainingTime);
    updateQuestionMeta(state);

    if (state.isPractice) {
      correctAnswerText.textContent = "例題（正解発表なし）";
    } else {
      correctAnswerText.textContent =
        state.correctAnswer !== null
          ? `正解: ${state.correctAnswer}%`
          : "正解: --";
    }
  }

  const myTeam = state.teams.find((team) => team.name === myTeamName);
  scoreText.textContent = myTeam
    ? `累計スコア ${myTeam.score} pt`
    : "累計スコア -- pt";

  // ゲージは回答公開・正解発表のときだけ描画
  if (showResultView) {
    renderGauge(state, myTeam);
  }

  // 順位発表画面の描画
  renderRanking(state);
});

function renderRanking(state) {
  rankingList.innerHTML = "";

  if (state.status !== "ranking_revealed" && state.status !== "finished") {
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

  const showCorrect = state.status === "correct_revealed";
  const correctValue =
    state.correctAnswer !== null ? clampAnswer(state.correctAnswer) : null;

  let myAnswer = null;
  const teamMarkers = [];

  state.revealedAnswers.forEach((item) => {
    if (item.answer === null) {
      return;
    }

    const percent = clampAnswer(item.answer);
    const isOwn = item.teamName === myTeamName;

    if (isOwn) {
      myAnswer = percent;
    }

    teamMarkers.push({
      teamName: item.teamName,
      percent,
      isOwn
    });
  });

  const tacho = renderTachometer({
    teamMarkers,
    myAnswer,
    correctValue: showCorrect ? correctValue : null,
    showCorrect
  });

  gaugeContainer.appendChild(tacho.root);

  const showMyTeamResult = myTeam && showCorrect;
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

    myTeamResult.textContent = `${myTeam.name} / 回答: ${answerText} ${scoreDeltaText}`;
    myTeamResult.style.display = "block";
  }
}

const TACHO = {
  cx: 150,
  cy: 150,
  radius: 108,
  needleLen: 92
};

function percentToRad(percent) {
  return Math.PI * (1 - percent / 100);
}

function tachoPoint(percent, radius = TACHO.radius) {
  const rad = percentToRad(percent);
  return {
    x: TACHO.cx + radius * Math.cos(rad),
    y: TACHO.cy - radius * Math.sin(rad)
  };
}

function valueToRotateDeg(value) {
  return value * 1.8 - 90;
}

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, val]) => {
    el.setAttribute(key, String(val));
  });
  return el;
}

function renderTachometer({ teamMarkers, myAnswer, correctValue, showCorrect }) {
  const root = document.createElement("div");
  root.className = "tacho-gauge";

  const svg = createSvgEl("svg", {
    viewBox: "0 0 300 180",
    class: "tacho-svg",
    role: "img",
    "aria-label": "回答タコメーター"
  });

  const defs = createSvgEl("defs");
  const gradient = createSvgEl("linearGradient", {
    id: "tachoArcGradient",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "0%"
  });
  gradient.appendChild(
    createSvgEl("stop", { offset: "0%", "stop-color": "#93c5fd" })
  );
  gradient.appendChild(
    createSvgEl("stop", { offset: "100%", "stop-color": "#2563eb" })
  );
  defs.appendChild(gradient);
  svg.appendChild(defs);

  const arcStart = tachoPoint(0, TACHO.radius);
  const arcEnd = tachoPoint(100, TACHO.radius);

  svg.appendChild(
    createSvgEl("path", {
      d: `M ${arcStart.x} ${arcStart.y} A ${TACHO.radius} ${TACHO.radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`,
      class: "tacho-arc-bg"
    })
  );

  svg.appendChild(
    createSvgEl("path", {
      d: `M ${arcStart.x} ${arcStart.y} A ${TACHO.radius} ${TACHO.radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`,
      class: "tacho-arc-fill"
    })
  );

  [0, 25, 50, 75, 100].forEach((tick) => {
    const outer = tachoPoint(tick, TACHO.radius);
    const inner = tachoPoint(tick, TACHO.radius - (tick % 50 === 0 ? 14 : 8));
    svg.appendChild(
      createSvgEl("line", {
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        class: tick % 50 === 0 ? "tacho-tick-major" : "tacho-tick-minor"
      })
    );

    if (tick % 50 === 0) {
      const labelPoint = tachoPoint(tick, TACHO.radius - 24);
      const label = createSvgEl("text", {
        x: labelPoint.x,
        y: labelPoint.y,
        class: "tacho-scale-label",
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      });
      label.textContent = `${tick}`;
      svg.appendChild(label);
    }
  });

  teamMarkers.forEach((marker) => {
    if (marker.isOwn) {
      return;
    }

    const point = tachoPoint(marker.percent, TACHO.radius - 2);
    svg.appendChild(
      createSvgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: 5,
        class: "tacho-team-dot"
      })
    );
  });

  if (myAnswer !== null) {
    const ownNeedle = createNeedleGroup("tacho-needle tacho-needle-own", myAnswer);
    svg.appendChild(ownNeedle);
  }

  if (showCorrect && correctValue !== null) {
    const correctNeedle = createNeedleGroup(
      "tacho-needle tacho-needle-correct",
      correctValue
    );
    svg.appendChild(correctNeedle);
  }

  svg.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy,
      r: 10,
      class: "tacho-hub"
    })
  );

  svg.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy,
      r: 4,
      class: "tacho-hub-center"
    })
  );

  root.appendChild(svg);

  const centerValue = document.createElement("div");
  centerValue.className = "tacho-center-value";
  if (showCorrect && correctValue !== null) {
    centerValue.innerHTML = `<span class="tacho-center-label">正解</span><span class="tacho-center-num">${correctValue}<small>%</small></span>`;
  } else if (myAnswer !== null) {
    centerValue.innerHTML = `<span class="tacho-center-label">あなた</span><span class="tacho-center-num">${myAnswer}<small>%</small></span>`;
  } else {
    centerValue.innerHTML = `<span class="tacho-center-label">回答</span><span class="tacho-center-num">--<small>%</small></span>`;
  }
  root.appendChild(centerValue);

  const legend = document.createElement("ul");
  legend.className = "tacho-legend";

  teamMarkers
    .slice()
    .sort((a, b) => a.percent - b.percent)
    .forEach((marker) => {
      const li = document.createElement("li");
      li.className = marker.isOwn ? "tacho-legend-own" : "tacho-legend-item";
      li.innerHTML = `<span class="tacho-legend-name">${marker.teamName}${marker.isOwn ? "（あなた）" : ""}</span><span class="tacho-legend-value">${marker.percent}%</span>`;
      legend.appendChild(li);
    });

  if (showCorrect && correctValue !== null) {
    const li = document.createElement("li");
    li.className = "tacho-legend-correct";
    li.innerHTML = `<span class="tacho-legend-name">正解</span><span class="tacho-legend-value">${correctValue}%</span>`;
    legend.appendChild(li);
  }

  root.appendChild(legend);

  requestAnimationFrame(() => {
    root.querySelectorAll(".tacho-needle").forEach((needle) => {
      const target = Number(needle.dataset.target);
      needle.style.transform = `rotate(${valueToRotateDeg(target)}deg)`;
    });
  });

  return { root };
}

function createNeedleGroup(className, value) {
  const group = createSvgEl("g", {
    class: `${className} tacho-needle`
  });
  group.dataset.target = String(value);

  group.appendChild(
    createSvgEl("line", {
      x1: TACHO.cx,
      y1: TACHO.cy,
      x2: TACHO.cx,
      y2: TACHO.cy - TACHO.needleLen,
      class: "tacho-needle-line"
    })
  );

  group.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy - TACHO.needleLen + 6,
      r: 4,
      class: "tacho-needle-tip"
    })
  );

  return group;
}

answerDecButton.addEventListener("click", () => {
  setAnswerValue(clampAnswer(answerInput.value) - 1);
});

answerIncButton.addEventListener("click", () => {
  setAnswerValue(clampAnswer(answerInput.value) + 1);
});

answerSlider.addEventListener("input", () => {
  setAnswerValue(answerSlider.value);
});

answerInput.addEventListener("change", () => {
  setAnswerValue(answerInput.value);
});

answerInput.addEventListener("blur", () => {
  if (answerInput.value === "") {
    setAnswerValue(50);
    return;
  }
  setAnswerValue(answerInput.value);
});

// 回答送信
submitAnswerButton.addEventListener("click", () => {
  const answer = clampAnswer(answerInput.value);
  setAnswerValue(answer);
  socket.emit("submitAnswer", answer);
});

// 回答受付結果
socket.on("answerResult", (result) => {
  answerMessage.textContent = result.message;

  if (result.success) {
    setAnswerControlsEnabled(false);
  }
});