# VIDEO_AND_SUBMISSION_UPDATES.md — Addendum (Pawl)

> This file ADDS to BUILD.md, BUILD_solo-tasks.md and INTEGRATION.md. It does not replace them and nothing in those files has been edited for it. Where this file and an older file disagree, this file wins for VIDEO and SUBMISSION tasks only (Tasks 6.2, 6.3, 6.4). Build tasks 0.1–5.4 are unchanged.

Source: Devpost reminder email to participants ("10 days to go").

## 1. Facts from the Devpost email

- Video: under 3 minutes, on YouTube, set to public.
- Open with the problem and who it is for, then show PayPal and AI working end to end.
- Cut loading screens and setup steps. An AI voiceover is allowed.
- Upload early: YouTube processing can take hours.
- Stage One (after Nov 12): the review team checks for a working build, a public repo with an open source license, a public video under 3 minutes, and meaningful use of PayPal and AI.
- Stage Two: judges score eligible projects 1 to 5 on Technological Implementation, Design, Potential Impact, Innovation/Idea and Presentation.
- Judges are not required to run the project, so the video carries heavy weight.
- Optional: submit by Thursday, Nov 5 for an early eligibility check.

## 2. Changes to the video plan (replaces only the 0:00–0:20 row of the Demo Path)

| Time | What the viewer sees | Code that runs |
|---|---|---|
| 0:00–0:20 | Problem and audience first: merchants and developers are giving AI agents PayPal tools that move real money, and text written by strangers can steer those agents. Optional single clause: a recent exchange breach showed the danger of one trusted path that both authorizes and approves (root cause not yet published). | landing page |

All other Demo Path rows stay as they are.

## 3. Additions to Task 6.2 (Demo video)

- Cut loading screens and setup steps. Waiting time may be cut, but every cut must show a small "sped up" label on screen, and the run itself must be real (real model, real PayPal sandbox).
- An AI voiceover is allowed. Script it from `docs/DEMO_SCRIPT.md`.
- Record two full takes. Choose the better one.
- Upload to YouTube, set to public, by Nov 10, 8:00 pm IST. Open the link while logged out to confirm it plays.
- The first minute must show the S2 moment: the unguarded agent causes a real refund in the sandbox, then the guarded run stops it.

## 4. Additions to Task 6.3 (Devpost text)

- Write the text so it works without the video: the problem, who it is for, how PayPal is used, how AI is used, what is new, how to run it.
- Map the text to the five scoring criteria in section 1 so each one has a visible answer.

## 5. Optional early eligibility check (Nov 5)

- Not required. Submit early only if all four Stage One items already exist: a working build, a public repo with a visible MIT license, a public video under 3 minutes, and meaningful PayPal and AI use.
- Before submitting early, confirm with Devpost (support@devpost.com or the PayPal Discord) whether a submitted entry can still be edited before Nov 12. The Official Rules only describe saving drafts before submitting.
- If any Stage One item is missing on Nov 5, skip the early check and keep the Nov 11 plan.

## 6. Self-check for Stage One (do this on Nov 9 and again on Nov 11)

- [ ] Hosted build runs end to end without an account, and the README run steps also work
- [ ] Repo is public and the MIT license shows in the About section
- [ ] Video is public, under 3:00, and plays while logged out
- [ ] README and text show meaningful PayPal use (sandbox calls, ledger read-back) and meaningful AI use (Watcher, target agent, Interpreter)
