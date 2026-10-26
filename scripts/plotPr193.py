"""Optional documentation figure: matplotlib, exact retained canonical samples."""
import gzip
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path("docs/performance/pr193")
with gzip.open(root / "laboratory-final-v6.json.gz", "rt", encoding="utf-8") as source:
    rows = {row["config"]["id"]: row for row in json.load(source)["rows"]}
cases = [
    ("counterattack:80-80:original:autonomous:0:central", "A · normal defence"),
    ("counterattack:80-80:original:passive:0:central", "A · initially passive defence"),
    ("clearance:80-80:original:control:0:left", "C · control objective"),
    ("clearance:80-80:original:touchline:0:left", "C · touchline objective"),
    ("contact_race:80-40:original:autonomous:0.2:central", "B · 80/40, 0.2 s delay"),
    ("contact_race:80-40:original:autonomous:1:central", "B · 80/40, 1.0 s delay"),
    ("wing:80-40:mirrored:autonomous:0:right", "D · wide 80/40, mirrored"),
    ("deflection:80-80:original:autonomous:0:central", "F · prescribed delivery / clearance"),
]
fig, axes = plt.subplots(4, 2, figsize=(13, 19), constrained_layout=True)
for ax, (identifier, title) in zip(axes.flat, cases):
    row = rows[identifier]
    samples = row["samples"]
    ax.set(facecolor="#eaf2eb", xlim=(-2, 107), ylim=(-2, 70), aspect="equal")
    ax.plot([0, 105, 105, 0, 0], [0, 0, 68, 68, 0], color="#67816b", lw=0.8)
    ax.plot([52.5, 52.5], [0, 68], color="#67816b", lw=0.7)
    for x, end in [(0, 16.5), (105, 88.5)]:
        ax.plot([x, end, end, x], [13.84, 13.84, 54.16, 54.16], color="#67816b", lw=0.6)
    ax.scatter([p["position"]["x"] for p in samples[0]["players"]],
               [p["position"]["y"] for p in samples[0]["players"]], c="#899a9e", s=10, label="initial bodies")
    ax.plot([s["ball"]["x"] for s in samples], [s["ball"]["y"] for s in samples], color="#a26500", lw=1.8, label="ball (100 ms samples)")
    runners = list(dict.fromkeys(r["actorId"] for s in samples for r in s["runs"]))[:2]
    for i, actor in enumerate(runners):
        points = [next((p["position"] for p in s["players"] if p["id"] == actor), None) for s in samples]
        points = [p for p in points if p]
        ax.plot([p["x"] for p in points], [p["y"] for p in points], color=["#2577ac", "#a84364"][i], lw=1, alpha=0.8, label="runner " + actor.rsplit(":", 1)[-1])
    for contact in row["collisions"]:
        ax.scatter(contact["point"]["x"], contact["point"]["y"], s=40, marker="x", color="#c94d16")
    duration = samples[-1]["at"] - samples[0]["at"]
    award = (row["award"] or {}).get("scenario", "none retained")
    ax.set_title(f"{title}\n{duration:.2f} s observed · shots {row['shots']} · last restart {award}", fontsize=11, loc="left")
    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    ax.legend(fontsize=7, loc="upper left")
fig.suptitle("PR193 · canonical trajectories, development protocol v2\nControlled initial geometry; 2D projections do not establish anatomical contact", fontsize=15)
(root / "figures").mkdir(exist_ok=True)
fig.savefig(root / "figures/selected-trajectories.svg", metadata={"Date": None})
fig.savefig(root / "figures/selected-trajectories.png", dpi=130)
plt.close(fig)
