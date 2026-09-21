# Get a reading passage out of a file

I have a file holding a passage a student reads aloud. Growing Reader could not read it — it is a scan, a photo, or a format it does not open. Please turn it into a Markdown file for me.

## What I need back

One Markdown file (`.md`, UTF-8) shaped exactly like this:

```markdown
# Camp Day Three

Sam and Pam went to camp. At camp they slept in a tent.
The tent was red and had a flap.
```

- **The first line is the passage's title**, written as a Markdown heading (`# ` then the title). Growing Reader reads that line to name the passage, so the file's own name does not matter — call the file whatever is easiest.
- **Everything after it is the passage itself**, exactly as printed.
- The title line is not counted as part of the passage, so put the title there and nowhere else.

## If you are Gemini, or any assistant that cannot attach files

Do not claim to attach a file and do not pretend one is coming. Put the whole thing — the `#` title line and the passage — in a single Markdown code block instead, so I can copy it or use your download-snippet button. Say plainly that you cannot attach a file and that the code block is the passage.

## What to include

- Every word of the passage itself, in the order it is printed.
- The passage's own line and paragraph breaks.

## What to leave out

This matters more than usual: a reading rate is the passage's word count divided by the time the student took, so every stray word makes the rate wrong.

Leave out:

- page numbers, headers and footers;
- the student name line, date line, and any score box;
- teacher instructions such as "Read the passage aloud" or "Time: ____";
- question numbers, comprehension questions, and answer keys printed with the passage;
- word-count or readability labels printed in the margin;
- footnotes, captions and figure labels the student does not read.

Do not add Markdown formatting of your own either: no bold, italics, bullet points, block quotes or extra headings. The `#` title line is the only Markdown in the file. The rest is the passage's own words and line breaks, plain.

## Rules

- Copy the wording exactly: same spelling, punctuation, capitalisation and hyphenation.
- Do not correct, simplify, rewrite, modernise or summarise anything, even if it looks wrong. A passage for a struggling reader is often deliberately simple or repetitive.
- Do not add anything that is not printed on the page.
- Keep a hyphenated word such as "well-known" as one hyphenated word.
- If the page has no printed title, give it a short plain one of your own on the `#` line, and say so.
- If part of the page is unreadable, leave that part out and tell me exactly where it was and why, rather than guessing at the words.

## When you are finished

1. Give me the Markdown as a file if you can attach one, or as a single code block if you cannot.
2. Tell me the passage's word count, not counting the title line, and counting the way a teacher counts on paper: split on spaces, and a hyphenated word counts once.
3. Tell me anything you left out or could not read.

Then I will drag that file into Growing Reader, or paste the passage in by hand.
