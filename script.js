// CircuitPlay — Moteur de simulation logique

// 1. Récupérer les éléments de la page.
const gateSelect = document.getElementById("gateSelect");
const inputAButton = document.getElementById("inputA");
const inputBButton = document.getElementById("inputB");
const inputBCard = document.getElementById("inputBCard");
const valueA = document.getElementById("valueA");
const valueB = document.getElementById("valueB");
const gateShape = document.getElementById("gateShape");
const gateSymbol = document.getElementById("gateSymbol");
const gateName = document.getElementById("gateName");
const gateDescription = document.getElementById("gateDescription");
const outputLamp = document.getElementById("outputLamp");
const outputValue = document.getElementById("outputValue");
const resultIcon = document.getElementById("resultIcon");
const resultTitle = document.getElementById("resultTitle");
const resultExplanation = document.getElementById("resultExplanation");
const formula = document.getElementById("formula");
const truthBody = document.getElementById("truthBody");
const headerB = document.getElementById("headerB");

// 2. État initial : les deux entrées sont à 0.
let A = false;
let B = false;

// 3. Informations pédagogiques sur chaque porte.
const gateInfo = {
  AND: {
    name: "AND",
    description: "La sortie vaut 1 seulement si A et B valent 1.",
    formula: "S = A ET B",
    symbol: "ET",
    path: "M25 12 H50 A33 33 0 0 1 50 78 H25 Z"
  },
  OR: {
    name: "OR",
    description: "La sortie vaut 1 si au moins une entrée vaut 1.",
    formula: "S = A OU B",
    symbol: "OU",
    path: "M25 12 Q42 45 25 78 Q70 78 96 45 Q70 12 25 12 Z"
  },
  NOT: {
    name: "NOT",
    description: "La sortie est l'inverse de A. L'entrée B n'est pas utilisée.",
    formula: "S = NON A",
    symbol: "NON",
    path: "M25 12 L83 45 L25 78 Z"
  }
};

// 4. Calculer le résultat logique.
// Une valeur true représente 1 ; false représente 0.
function calculate(gate, a, b) {
  switch (gate) {
    case "AND":
      return a && b;
    case "OR":
      return a || b;
    case "NOT":
      return !a;
    default:
      return false;
  }
}

// 5. Transformer une valeur booléenne en texte.
function bit(value) {
  return value ? "1" : "0";
}

// 6. Mettre à jour un interrupteur visuellement et pour l'accessibilité.
function updateToggle(button, value) {
  button.setAttribute("aria-checked", String(value));
}

// 7. Construire la table de vérité selon la porte sélectionnée.
function renderTruthTable(gate) {
  truthBody.replaceChildren();

  // La porte NON possède une seule entrée.
  const combinations = gate === "NOT"
    ? [[false, false], [true, false]]
    : [
        [false, false],
        [false, true],
        [true, false],
        [true, true]
      ];

  inputBCard.hidden = gate === "NOT";
  headerB.hidden = gate === "NOT";

  combinations.forEach(([a, b]) => {
    const row = document.createElement("tr");
    const output = calculate(gate, a, b);

    // Marquer la combinaison actuellement simulée.
    const active = A === a && (gate === "NOT" || B === b);
    if (active) row.classList.add("active-row");

    const cellA = document.createElement("td");
    cellA.textContent = bit(a);
    row.appendChild(cellA);

    const cellB = document.createElement("td");
    cellB.textContent = gate === "NOT" ? "—" : bit(b);
    if (gate === "NOT") cellB.hidden = true;
    row.appendChild(cellB);

    const cellOutput = document.createElement("td");
    cellOutput.textContent = bit(output);
    row.appendChild(cellOutput);

    truthBody.appendChild(row);
  });
}

// 8. Actualiser tout le laboratoire.
function render() {
  const gate = gateSelect.value;
  const info = gateInfo[gate];
  const output = calculate(gate, A, B);

  updateToggle(inputAButton, A);
  updateToggle(inputBButton, B);

  valueA.textContent = bit(A);
  valueB.textContent = bit(B);

  valueA.classList.toggle("on", A);
  valueB.classList.toggle("on", B);

  gateDescription.textContent = info.description;
  gateName.textContent = info.name;
  gateSymbol.textContent = info.symbol;
  gateShape.setAttribute("d", info.path);
  formula.textContent = info.formula;

  // Afficher la lampe en fonction de la sortie.
  outputLamp.classList.toggle("on", output);
  outputLamp.setAttribute(
    "aria-label",
    output ? "Sortie allumée, valeur 1" : "Sortie éteinte, valeur 0"
  );

  outputValue.textContent = output ? "1 · VRAI" : "0 · FAUX";
  resultIcon.textContent = output ? "●" : "○";
  resultTitle.textContent = output
    ? "Sortie activée"
    : "Sortie désactivée";

  resultExplanation.textContent =
    `A = ${bit(A)}, B = ${gate === "NOT" ? "non utilisée" : bit(B)}. ` +
    `La sortie vaut ${bit(output)}.`;

  renderTruthTable(gate);
}

// 9. Interactions des interrupteurs.
inputAButton.addEventListener("click", () => {
  A = !A;
  render();
});

inputBButton.addEventListener("click", () => {
  B = !B;
  render();
});

// 10. Changement de porte logique.
gateSelect.addEventListener("change", render);

// 11. Réinitialiser la simulation.
document.getElementById("resetBtn").addEventListener("click", () => {
  A = false;
  B = false;
  gateSelect.value = "AND";
  render();
});

// 12. Défis : chaque question possède une réponse vérifiée.
const challenges = [
  {
    question: "Avec la porte ET, si A = 1 et B = 1, quelle est la sortie ?",
    gate: "AND", a: true, b: true, answer: true,
    explanation: "ET donne 1 uniquement lorsque les deux entrées valent 1."
  },
  {
    question: "Avec la porte OU, si A = 1 et B = 0, quelle est la sortie ?",
    gate: "OR", a: true, b: false, answer: true,
    explanation: "OU donne 1 lorsqu'au moins une entrée vaut 1."
  },
  {
    question: "Avec la porte ET, si A = 1 et B = 0, quelle est la sortie ?",
    gate: "AND", a: true, b: false, answer: false,
    explanation: "La deuxième entrée vaut 0 : les deux entrées ne sont pas à 1."
  },
  {
    question: "Avec la porte NON, si A = 0, quelle est la sortie ?",
    gate: "NOT", a: false, b: false, answer: true,
    explanation: "NON inverse l'entrée : 0 devient 1."
  },
  {
    question: "Avec la porte OU, si A = 0 et B = 0, quelle est la sortie ?",
    gate: "OR", a: false, b: false, answer: false,
    explanation: "Aucune entrée ne vaut 1 : la sortie OU reste à 0."
  },
  {
    question: "Avec la porte NON, si A = 1, quelle est la sortie ?",
    gate: "NOT", a: true, b: false, answer: false,
    explanation: "NON inverse l'entrée : 1 devient 0."
  }
];

let challengeIndex = 0;
let score = 0;
let answered = 0;
let locked = false;

const challengeQuestion = document.getElementById("challengeQuestion");
const challengeCount = document.getElementById("challengeCount");
const challengeFeedback = document.getElementById("challengeFeedback");
const nextChallenge = document.getElementById("nextChallenge");
const scoreElement = document.getElementById("score");
const answerChoices = document.getElementById("answerChoices");

function renderChallenge() {
  const item = challenges[challengeIndex];

  challengeQuestion.textContent = item.question;
  challengeCount.textContent =
    `Question ${challengeIndex + 1} / ${challenges.length}`;

  challengeFeedback.textContent =
    "Choisis une réponse pour vérifier ta compréhension.";
  challengeFeedback.className = "feedback";

  answerChoices.querySelectorAll("button").forEach(button => {
    button.disabled = false;
  });

  nextChallenge.textContent =
    challengeIndex === challenges.length - 1
      ? "Recommencer les défis ↻"
      : "Question suivante →";

  locked = false;
}

function updateScore() {
  scoreElement.textContent = `Score : ${score} / ${answered}`;
}

answerChoices.addEventListener("click", event => {
  const button = event.target.closest("button[data-answer]");

  if (!button || locked) return;

  locked = true;
  answered++;

  const item = challenges[challengeIndex];
  const selected = button.dataset.answer === "1";

  // Le score ne change que si la réponse est correcte.
  if (selected === item.answer) {
    score++;
    challengeFeedback.textContent = "Bonne réponse ! " + item.explanation;
    challengeFeedback.className = "feedback correct";
  } else {
    challengeFeedback.textContent =
      `Pas tout à fait. La bonne réponse est ${bit(item.answer)}. ` +
      item.explanation;
    challengeFeedback.className = "feedback incorrect";
  }

  answerChoices.querySelectorAll("button").forEach(choice => {
    choice.disabled = true;
  });

  updateScore();
});

nextChallenge.addEventListener("click", () => {
  if (challengeIndex === challenges.length - 1) {
    challengeIndex = 0;
    score = 0;
    answered = 0;
    updateScore();
  } else {
    challengeIndex++;
  }

  renderChallenge();
});

// 13. Initialiser la page au premier chargement.
render();
renderChallenge();
updateScore();
