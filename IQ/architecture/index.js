/**
 * IQ — architecture questions. See IQ/README.md and IQ/timing-cdc/index.js
 * for the shape. Add entries to QUESTIONS and they appear in the panel
 * automatically.
 */

export const QUESTIONS = [
  {
    id: 'multiply-with-inc-dec-jz-jnz',
    difficulty: 'medium',
    title: 'כפל ב-inc/dec/jz/jnz בלבד',
    intro:
`התחלה: \`r1=a, r2=b, r3=0, r4=0\`. פקודות זמינות: \`jz, jnz, inc, dec\`. ממש \`r4 = r1·r2\`.`,
    parts: [
      {
        label: 'א',
        editor: 'verilog',
        editorLabel: 'Assembly',
        editorHint: 'כתוב את קטע הקוד בעורך למטה. השתמש רק ב-inc/dec/jz/jnz.',
        starterCode:
`; r1 = a, r2 = b, r3 = 0, r4 = 0
; goal: r4 = r1 * r2 using only inc/dec/jz/jnz

loop_outer:
    ; TODO: terminate when r2 reaches 0

    ; TODO: phase1 — add r1 to r4, copy r1 into r3 in the process

    ; TODO: phase2 — restore r1 from r3

end_mul:
`,
        question: 'כתוב את הקוד. איזה רג\' משמש כמונה? איך משחזרים את r1?',
        hints: [
          'לולאה חיצונית עם r2 (יורד עד 0).',
          'phase1: dec r1, inc r3, inc r4 — מעביר r1 ל-r3 ומוסיף ל-r4.',
          'phase2: שחזר r1 מ-r3. "קפיצה לא-מותנית" = \`jz\` על רג\' שאתה יודע שהוא 0.',
        ],
        answer:
`\`\`\`
loop_outer:
    jz  r2, end_mul
    dec r2
phase1:                ; r4 += r1, copy r1 → r3
    jz  r1, phase2
    dec r1
    inc r3
    inc r4
    jnz r1, phase1
phase2:                ; restore r1 from r3
    jz  r3, loop_outer
    dec r3
    inc r1
    jnz r3, phase2
end_mul:
\`\`\`

**סוף:** \`r1=a, r2=0, r3=0, r4=a·b\`. סיבוכיות \`Θ(ab)\`.

**טריק:** "קפיצה לא-מותנית" ל-\`loop_outer\` מושגת ע"י \`jz r3\` בנקודה שבה r3=0 בוודאות.`,
        interviewerMindset:
`שתי נקודות שמועמדים מפספסים — והמראיין מחכה:

1. **"קפיצה לא-מותנית" בלי הוראה כזו** — לבנות את הזרימה כך שתגיע ל-\`jz\` עם רגיסטר באפס מובטח. זה ה"אהה" של השאלה.
2. **r2 ייצרך — וזה לגיטימי.** הרבה ינסו "לשמור" את r2 במשתנה נוסף. אסור (אין mov). יש להגיד מפורש: "אני מוותר על r2, זה התכן הנכון".

**בונוס:** להזכיר ש-phase1 ו-phase2 פועלות יחד גם כהעתקה (r1→r3) וגם כצבירה (r4 += a) — שתי משימות במכה אחת.`,
        expectedAnswers: [
          'jz r2', 'dec r2', 'jnz r1', 'inc r3', 'inc r4',
          'jz r3', 'inc r1', 'jnz r3',
          'phase1', 'phase2', 'loop_outer',
        ],
      },
    ],
    source: 'מאגר ראיונות — תכנות ברמת ISA עם מערך פקודות מוגבל',
    tags: ['isa', 'assembly', 'control-flow', 'puzzle', 'architecture'],
  },
];
