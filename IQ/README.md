# IQ — Interview Questions

תיקייה זו מאחסנת את השאלות שמופיעות בלשוניות של חלונית **INTERVIEW** באפליקציה.

## פורמט

כל לשונית בחלונית מתאימה לתת-תיקייה כאן. בכל תת-תיקייה — קובץ אחד או יותר ב-JSON או Markdown.

```
IQ/
├── logic/          → לשונית "Logic"
├── sequential/     → לשונית "Sequential"
├── verilog/        → לשונית "Verilog"
├── architecture/   → לשונית "Architecture"
├── timing-cdc/     → לשונית "Timing & CDC"
├── dft/            → לשונית "DFT"
└── puzzles/        → לשונית "חידות"
```

### סכמת JSON (מומלצת)

```json
{
  "id": "setup-hold-basics",
  "title": "מהו setup time ומהו hold time?",
  "difficulty": "easy",
  "question": "<טקסט השאלה כפי שהיא מופיעה בראיון>",
  "hint": "<רמז אופציונלי>",
  "answer": "<תשובה מלאה>",
  "tags": ["timing", "ff"],
  "source": "<URL או תיאור איפה השאלה נמצאה>"
}
```

שדות `hint`, `tags`, `source`, `difficulty` — אופציונליים. החובה היא `id`, `title`, `question`, `answer`.

### חלופה: Markdown

קובץ `.md` עם front-matter:

```markdown
---
id: setup-hold-basics
title: מהו setup time ומהו hold time?
difficulty: easy
tags: [timing, ff]
---

## שאלה
<טקסט השאלה>

## רמז
<אופציונלי>

## תשובה
<תשובה מלאה>
```

המנוע יקבל את שני הפורמטים. בחר את מה שנוח לך לערוך.

## כללים

- **טקסט בעברית** למלל; **מושגים מקצועיים נשארים באנגלית** (`flip-flop`, `metastability`, `pipeline hazard`).
- **`id` ייחודי** בתוך תת-התיקייה. נמנעים מהתנגשויות בין שאלות.
- **תמונות / סכמות** — ב-`IQ/<topic>/_assets/` (אם רלוונטי), עם רפרנס יחסי בתשובה.
- **מקור** — אם השאלה מאתר חיצוני, לציין URL ב-`source` (לקרדיט ולמקרים שצריך לבדוק שוב).

## איך זה מתחבר לאפליקציה

`js/interview/topics.js` מגדיר את שבע הלשוניות ומפרט מאיפה לטעון את התוכן של כל אחת.
המנוע (יבוא בעצלנות בלחיצה הראשונה על כפתור 💼 INTERVIEW) קורא את הקבצים, מכניס שאלות ל-cards.

נכון לעכשיו התיקייה ריקה. ה-UI מציג placeholder "אין שאלות לנושא הזה — הוסף קובץ לתיקייה" ומסתדר אוטומטית כשקבצים נכנסים.
