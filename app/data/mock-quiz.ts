import type { QuizQuestion } from "@/app/types";

/** Platform-served question bank — players never pick questions.
 *  Production: serve server-side, randomized per match, identical set
 *  + timing for every player in the lobby. */
export const quizBank: QuizQuestion[] = [
  {
    id: "q1",
    text: "who scored the fastest goal in world cup history — 11 seconds in?",
    answers: ["hakan şükür", "clint dempsey", "david villa", "tim cahill"],
    correctIndex: 0,
    seconds: 15,
  },
  {
    id: "q2",
    text: "which country has won the most world cups?",
    answers: ["germany", "italy", "brazil", "argentina"],
    correctIndex: 2,
    seconds: 10,
  },
  {
    id: "q3",
    text: "what year was VAR first used at a world cup?",
    answers: ["2010", "2014", "2018", "2022"],
    correctIndex: 2,
    seconds: 12,
  },
  {
    id: "q4",
    text: "who holds the record for most world cup goals?",
    answers: ["ronaldo (r9)", "miroslav klose", "pelé", "messi"],
    correctIndex: 1,
    seconds: 10,
  },
  {
    id: "q5",
    text: "the 2026 world cup is the first with how many teams?",
    answers: ["32", "40", "48", "64"],
    correctIndex: 2,
    seconds: 10,
  },
];
