# Ghost Job Detector

Work in progress. Paste a job posting, get a "ghost job" risk score with a
breakdown of which signals drove it. The scoring model is logistic regression
written from scratch (no ML libraries), trained on postings I labeled myself.

The full README (live link, architecture, setup) is written at the end of the project.

## Setup (Windows, PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Labeling tool (runs only on your computer)

```powershell
.\.venv\Scripts\python.exe -m labeler.app
```

Then open http://127.0.0.1:5000. Labeled postings are saved to
`data/labeled_postings.csv`, which is gitignored (job postings are the
companies' copyrighted text).

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -v
```
