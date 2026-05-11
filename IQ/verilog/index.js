/**
 * IQ — verilog questions.
 */

export const QUESTIONS = [
  {
    id: 'blocking-vs-nonblocking',
    difficulty: 'medium',
    title: 'בלוקינג מול non-blocking — מצא את הבאג',
    intro:
`הקוד הבא אמור לממש shift register באורך 2 (a → b → out), אבל
הסימולציה והסינתוז נותנים תוצאות לא צפויות. מה הבאג?

\`\`\`verilog
module shifter (
    input  wire clk,
    input  wire d_in,
    output wire out
);
    reg a, b;

    always @(posedge clk) begin
        a = d_in;
        b = a;
    end

    assign out = b;
endmodule
\`\`\``,
    parts: [
      {
        label: null,
        editor: 'verilog',
        starterCode:
`module shifter (
    input  wire clk,
    input  wire d_in,
    output wire out
);
    reg a, b;

    // TODO: fix this always block

    assign out = b;
endmodule
`,
        question: 'מה הבאג? תקן את הקוד כך שיהיה shift register נכון.',
        hints: [
          'בלוקינג (\`=\`) מבצע את ההוראות **לפי הסדר, מיד**. נון-בלוקינג (\`<=\`) דוחה את ההצבה עד סוף הבלוק.',
          'בקוד הקיים: \`a = d_in\` מתבצע מיד → \`b = a\` משתמש ב-a **החדש**, לא הישן. שני ה-FFים מתמזגים ל-FF אחד.',
          'הפתרון: \`<=\` בשניהם. אז \`b\` ילך לקבל את \`a\` **הישן** ב-edge הנוכחי.',
        ],
        answer:
`\`\`\`verilog
module shifter (
    input  wire clk,
    input  wire d_in,
    output wire out
);
    reg a, b;

    always @(posedge clk) begin
        a <= d_in;   // non-blocking
        b <= a;      // non-blocking → uses the OLD a
    end

    assign out = b;
endmodule
\`\`\`

**הבאג:** \`=\` (blocking) ב-\`always @(posedge clk)\` גורם ל-\`a\` להתעדכן מיד, ואז \`b = a\` משתמש בערך **החדש** של a. תוצאה: השרשרת קורסת ל-FF יחיד (a, b שניהם = d_in).

**התיקון:** \`<=\` (non-blocking). שני ה-RHS מחושבים מהערכים הישנים, ההצבה קורית בסוף הבלוק. \`b\` מקבל את \`a\` שהיה לפני ה-edge.

**כלל הזהב:**
- \`<=\` ב-\`always @(posedge clk)\` (סדרתי).
- \`=\` ב-\`always @(*)\` (קומבינטורי).
- אל תערבב בתוך אותו בלוק.

**טעות נוספת שמראיינים שואלים:** מה אם נהפוך את הסדר ל-\`b = a; a = d_in;\` עם blocking? אז b לוקח את a הישן (וזה עובד "בטעות"), אבל הקוד שביר — תלוי בסדר ההוראות, וזה מתפרק ברגע שמוסיפים שלב.`,
        interviewerMindset:
`קלאסיקה מוחלטת. השאלה הזו מוגשת בכל ראיון Verilog ראשון. המראיין רוצה לבדוק שני דברים:

1. **שאתה רואה את הבאג מיד** — לא מאחר 30 שניות לחשוב. \`=\` ב-posedge clk = דגל אדום.
2. **שאתה מסביר את **למה** ולא רק "תחליף ל-<=":** כי blocking מבוצע מיד והשני רואה את הערך החדש.

**בונוס:** הזכרת ש-\`<=\` הוא non-blocking *ב-procedural blocks*, אבל ב-\`assign\` הוא הופך למשמעות אחרת (השוואה!). זה מראה הבנה עמוקה.`,
        expectedAnswers: [
          '<=', 'non-blocking', 'nonblocking',
          'a <= d_in', 'b <= a', 'a<=d_in', 'b<=a',
          'blocking', 'merge', 'מתמזגים',
        ],
      },
    ],
    source: 'מאגר ראיונות — bug-spotting קלאסי ב-Verilog',
    tags: ['verilog', 'blocking', 'non-blocking', 'bug', 'shift-register'],
  },
];
