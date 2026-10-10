# Kiku

A deliberately simple flashcard web app with one twist: you store your own solution for each
card, answer by **speaking or typing**, and an AI marks which parts of your solution you
actually covered, including things you said in your own words.

- **Green**: you said it, literally or in meaning
- **Grey**: you did not mention it
- **Red**: the AI is unsure, or you said something that contradicts the solution

Every run is saved per card, so you can see whether you are getting better over time.

| Result after answering | History of one card |
|---|---|
| ![Graded solution](docs/screenshots/result.png) | ![Card history](docs/screenshots/history.png) |

The interface is in German. It runs in any modern browser and is laid out for iPad first, so
it works on tablets, phones, Mac and Windows alike. On iPad you can add it to the home screen.

## Features

- Folders with any depth of subfolders, cards with question and solution side by side; folders and cards can be moved
- Rich cards: bold, italic, highlighting, headings, lists, tables, formulas (LaTeX) and pictures, written in an editor that shows the card as it will look. Pictures are pasted, dropped or picked
- Image occlusion: cover spots of a diagram and name them; each spot becomes a card that asks for it
- Cloze cards: mark gaps in a text (`[[word]]`, or Anki's `{{c1::word}}`); each gap becomes a card that asks for it
- Import: paste a table, or drop an Excel (.xlsx), CSV, TSV or text file; choose which columns hold question and solution. Tens of thousands of rows take about a second
- Import from Anki: packages (.apkg, .colpkg) with their decks as subfolders, pictures, formatting and cloze notes; text exports with HTML are converted too
- Export a folder or the whole library as CSV (Excel, Numbers), as an Anki package (.apkg) with pictures and covered occlusion boxes, as a text file for Anki, or as plain tab-separated text (Quizlet and others); all of them can be imported again
- Select several cards at once to move, tag or delete them; deleting a card or folder can be undone right away
- AI cards from your material: upload lecture slides or a script (PDF, also scanned; PowerPoint, Word, text, photos of your notes), review the proposed cards, then save them
- Spaced repetition: after each answer the card is scheduled for its next repetition (FSRS), with the AI's score as the rating
- Exam dates: set the day of the exam on a folder and "Heute lernen" hands out what is due plus today's share of the new cards; the number of new cards per day is adjustable in the settings
- Study a folder including all of its subfolders, only its weak cards, or a single card
- Jump back and forth between cards while studying (buttons or arrow keys), shuffle, or just reveal a solution
- Leave a study session or an exam simulation at any point and continue it later where you stopped, handwriting included
- Search across all questions and solutions
- Voice answers of any practical length: recorded in the browser, transcribed by an AI model
- Typed answers as an alternative, and you can correct the transcript before grading
- Handwritten answers: write with Apple Pencil, another stylus or a finger; the AI reads the writing and grades it
- Hands-free studying: the question is read aloud, you answer, the result is announced, the next card follows
- After grading, the AI explains on request what was missing and how to remember it
- Tags and a star to mark cards across folders, to filter by and to study
- Statistics: streak, answers per day, average score and the repetitions coming up
- Share a folder by link; others can read it and copy it into their own library
- Works without a network: browse, write cards and answer; answers given offline are graded as soon as the connection is back
- A sample folder for the first visit, so the spoken answer and the grading can be tried right away
- Per-card history with score trend and the graded solution of every attempt
- Light and dark theme
- JSON backup and restore

## Getting started

Requirements: Node.js 22 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
cp .env.example .env.local   # then add your OpenRouter key
pnpm dev
```

Open http://localhost:3000.

### Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | | Key from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `GRADING_MODEL` | no | `openai/gpt-6-luna` | Model that compares answer and solution |
| `TRANSCRIBE_MODEL` | no | `google/gemini-3.8-flash` | Model that transcribes recordings; must accept audio input |
| `PAID_EMAILS` | no | | With accounts on: comma-separated e-mail addresses of paid accounts. Everyone else is on the free plan |

With accounts on, AI use is limited per account: gradings and explanations per month (`AI_LIMITS` in
`src/server/quota.ts`: 500 paid; 1000 free as a guard against scripts, since free accounts use free
and very cheap models), card generation and pictures read by the AI per day.
Without accounts (local mode) nothing is counted.
| `FREE_PLAN_GRADING_MODELS` | no | two free models, then a very cheap one | Comma-separated models that grade for the free plan, tried in order |

On the free plan the browser's own speech recognition transcribes (Chrome, Edge, Safari), and
grading uses free OpenRouter models, falling back to a very cheap one when they are used up.
Without accounts (local mode) the plans do not apply: your own key pays, the full models run.

### Using the microphone on another device

Browsers only allow microphone access over HTTPS or on `localhost`. To test on an iPad in your
local network, run `pnpm dev --experimental-https` and open the `https://` address, or deploy
the app.

## Where is my data?

The app runs in one of two modes, decided by the environment:

**Local mode (default).** Folders, cards and attempts are stored in your browser (IndexedDB).
No account, no server database, no sync. Use *Einstellungen → Backup* to move data or keep a copy.

**Server mode.** With a Postgres database and Neon Auth configured, users sign up and sign in,
and their library syncs between all their devices. The browser still keeps a local copy and
works on it directly, so the app stays fast; changes are sent to the server in the background.

Sent to the AI provider in both modes: the question, your solution and your answer for
grading, the audio recording for transcription, and the text of material you turn into cards.
Pictures in cards are never sent to the AI.

## Accounts, sync and MCP (server mode)

1. Create a [Neon](https://neon.com) project and enable **Auth** on its branch.
2. Put `DATABASE_URL`, `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` into `.env.local`
   (see `.env.example`). With the Neon CLI linked to the project, `neon env pull` writes the
   first two.
3. Create the tables: `pnpm db:migrate`
4. Start the app with `pnpm dev:https` and open the `https://` address. It now asks you to sign in.
   The session cookie is a secure cookie; over plain `http://` some browsers (Safari) do not
   keep it, and the sign-in then appears to do nothing.

Data you created in local mode before your first sign-in on a device is added to your account.
Signing out removes the local copy from that device; the library stays in the account. The
settings offer changing the password and deleting the account (library, pictures, shares and
tokens on the server, then the account at Neon Auth); "Passwort vergessen" on the sign-in page
sends a reset link through Neon Auth.

### How sync works

- Every row carries the time of its last change. If two devices change the same card, the
  later change wins. Deletions are synced too.
- A device syncs shortly after each change, when its tab becomes visible again, when the
  network returns, and every 30 seconds while open.
- Resumable study sessions are per device and are not synced.

### Letting Claude work on your library (MCP)

The app exposes an [MCP](https://modelcontextprotocol.io) endpoint at `/api/mcp`, built with
the official TypeScript SDK. An assistant connected to it can read the library and learning
history and create, edit, move and delete folders and cards, for example to turn lecture
notes into flashcards. Changes show up in the app on the next sync.

1. In the app, open *Einstellungen → Zugriff für Claude (MCP)* and create an access token.
   It is shown once.
2. Connect your client. For Claude Code:

   ```bash
   claude mcp add --transport http kiku https://your-host/api/mcp \
     --header "Authorization: Bearer kk_..."
   ```

A token has full access to its account, including deleting; revoke it in the same place.
Clients that can only connect through OAuth (rather than a header) are not supported yet.

Tools: `get_overview`, `list_cards`, `get_card`, `create_folder`, `update_folder`,
`delete_folder`, `create_cards`, `update_card`, `delete_card`.

## How grading works

1. The model splits your solution into small statements and labels each one as `correct`,
   `missing` or `unsure`.
2. The server maps those statements back onto your original text. If the model changed or
   skipped any of it, the result is discarded and requested again.
3. If that fails twice, the server splits the solution into sentences itself and only asks
   the model for a label per sentence.

This way the solution you see is always your own text, never a rewritten version. The score
is the share of the solution (by characters) that was labelled `correct`.

Limits: grading quality depends on the model; it can be wrong, which is why uncertain parts
are shown in red rather than guessed.

## Cards: text, formatting and pictures

Question and solution are stored as plain text with a small Markdown subset (`**bold**`, `*italic*`,
`==marked==`, `` `code` ``, `$formulas$`, `#` headings, `-` and `1.` lists, tables, pictures). The
editor shows the formatted card and translates to and from that markup (a button switches to the
source); a card without any markup stays the plain text it always was. Import, export, search
and the MCP tools all work on this one string.

Pictures are scaled down in the browser (longest edge 1600 px, WebP) and kept in IndexedDB. A card
refers to one as `![](kiku-img:<id>)`. With an account each picture is uploaded once
(`/api/images/<id>`) and fetched by other devices when a card shows it. Backups contain them.

For grading, the solution is sent without markup and without pictures: the AI compares text.
A card whose solution is only a picture can be revealed but not graded.

## Importing from Anki

An Anki package is a ZIP archive with the collection as an SQLite database. It is read in the
browser without a database library: `src/lib/sqlite.ts` scans the tables, `src/lib/anki.ts` turns
notes into cards. Both package formats work, the older one and the Zstandard-compressed one that
current Anki versions write.

- The first field of a note is the question, the other fields together the solution. A cloze
  note becomes one card: the text with gaps as the question, the full text as the solution.
- HTML becomes card formatting (`src/lib/html.ts`); colours, fonts and audio are dropped.
- Pictures are stored like pasted ones. With several decks each deck becomes a subfolder.
- Scheduling and review history stay in Anki: Kiku grades answers differently, so every
  imported card starts as new.

## Handwriting, scans and other pictures the AI reads

`/api/read-image` hands a picture to the transcription model and returns the text on it. It is
used for handwritten answers (`src/components/Handwriting.tsx`, `src/lib/ink.ts`: strokes are kept
as points, painted with the pen's pressure and sent as one cropped picture) and for pages of
study material without a text layer (`src/lib/material.ts`). With accounts on, the number of
pictures per day is limited (`IMAGE_LIMITS` in `src/server/quota.ts`).

## Offline

`/sw.js` (`src/app/sw.js/route.ts`) is a service worker that answers from the network while there
is one and from its cache otherwise. The data is in IndexedDB anyway, so what it stores are the
pages of the app. Pages that carry an id in their address (`/f/<id>`, `/c/<id>`) are identical
apart from that id; for one that was never opened the worker takes the stored copy of another id
and swaps the id. `src/lib/offline.ts` loads one page of each kind after a new version is
installed. Every deployment has its own cache. Transcription and sync need the network. An answer
given without one is kept in IndexedDB (`pending` table) and graded by `src/lib/pendingGrades.ts`
when the app is opened or the network returns; the attempt keeps the time the answer was given.

## Sharing

A share is a random token for a folder (`src/server/shares.ts`). `/s/<token>` shows the folder
with its subfolders as it is at that moment, without an account. Pictures are served through the
link only if one of the shared cards shows them. Copying creates new folders, cards and pictures
in the reader's library; the original owner's star and learning history are not part of it.

## Spaced repetition and exam dates

Nothing extra is stored for scheduling: a card's next date follows from its attempts, replayed
through [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) with the score as the rating
(below 40 % again, below 70 % hard, below 90 % good, otherwise easy). Every device therefore
arrives at the same dates, and history from before this feature counts.

"Heute lernen" contains the cards that are due and today's share of the cards never answered:
10 per day (adjustable per device in the settings), or, if the folder (or a parent) has an exam date, the remaining new cards spread
evenly over the days until three days before the exam. In those last three days every card
comes up once more. The logic is in `src/lib/srs.ts`.

## AI cards from study material

Files are read in the browser (`src/lib/material.ts`): PDFs with pdf.js, PowerPoint and Word files
by unzipping them. Only the text is sent to `/api/generate`, in pieces of about four pages, so
the size of the file does not matter. Scanned pages without a text layer cannot be read yet.
With accounts on, requests per day are limited (`GENERATE_LIMITS` in `src/server/quota.ts`).

## How long recordings work

Hosts like Vercel cap a request body at 4.5 MB, which is about two minutes of 16 kHz WAV.
Instead of uploading one file at the end, the browser cuts the recording into pieces of 45 to
60 seconds while you are still speaking, always at the quietest moment in that window so a
cut falls into a pause. Each piece is transcribed right away and the texts are joined in
order. This removes the length limit without extra storage, and most of the transcript is
already done when you stop. A recording ends on its own after 30 minutes.

## Project structure

```
src/app/                 routes (library, folder, card, study session, settings)
src/app/api/grade        compares answer and solution
src/app/api/transcribe   speech to text
src/components/          UI components (FormulaNode.tsx typesets formulas inside the editor)
src/lib/repo.ts          data access in the browser (IndexedDB)
src/lib/sync.ts          browser half of the sync
src/server/              database schema, server half of the sync, MCP server, access tokens
drizzle/                 database migrations
src/lib/grading.ts       segment alignment, sentence splitting, scoring
src/lib/audio.ts         cutting a running recording into pieces, WAV encoding
src/lib/importCards.ts   parsing pasted tables and CSV files
src/lib/office.ts        reading .xlsx, .pptx and .docx without a library (src/lib/zip.ts)
src/lib/anki.ts          reading Anki packages (src/lib/sqlite.ts, src/lib/html.ts)
src/lib/exportCards.ts   CSV, Anki and tab-separated export
src/lib/richText.ts      the Markdown subset of cards; src/components/RichText.tsx renders it
src/lib/images.ts        pictures in cards: scaling, local storage, upload
src/lib/srs.ts           spaced repetition and the plan towards an exam
src/lib/stats.ts         streak and the numbers of the statistics page
src/lib/ink.ts           handwriting: strokes, painting, the picture the AI reads
src/lib/occlusion.ts     image occlusion cards, and the covered picture for the Anki export
src/lib/cloze.ts         cloze cards from a text with gaps
src/lib/pendingGrades.ts grading answers that were given offline
src/lib/toast.ts         short messages with an undo button (src/components/Toasts.tsx)
src/lib/settings.ts      preferences kept on the device
src/lib/sample.ts        the sample folder for the first visit
src/server/account.ts    deleting everything an account stored
src/lib/editorHtml.ts    card text to and from the visual editor (src/components/VisualEditor.tsx)
src/lib/ankiExport.ts    writing Anki packages (src/lib/sqliteWrite.ts, src/lib/zipWrite.ts)
src/lib/offline.ts       registering the service worker and storing the pages
src/server/shares.ts     folders shared by link
src/server/generate.ts   AI cards from study material
docs/design-references/  screens of other flashcard apps used as inspiration
```

## Scripts

```bash
pnpm dev         # development server
pnpm build       # production build
pnpm test        # unit tests (Vitest)
pnpm lint        # ESLint
pnpm typecheck   # TypeScript
pnpm db:generate # create a migration after changing src/server/schema.ts
pnpm db:migrate  # apply migrations to DATABASE_URL
```

## Tech stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, daisyUI 5, Dexie (IndexedDB), AI SDK 7
with the OpenRouter provider, Vitest.

## Roadmap

- OAuth for the MCP endpoint, so clients without custom headers can connect
- English interface
- Push notifications as a reminder to keep the streak
- Checkout and subscription management (paid accounts are listed by hand today)

## License

[MIT](LICENSE)
