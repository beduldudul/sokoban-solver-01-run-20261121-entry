[![make.fun](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/beduldudul/sokoban-solver-01-run-20261121-entry/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/beduldudul/sokoban-solver-01-run-20261121-entry/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

# Sokoban solver

A push-optimal Sokoban solver (Node 22, no dependencies). Each level is a hallway plus one to four rooms; a box pushed out of a room through its door can never come back, so every box stays in its room and the level's push-optimum is the sum of the rooms' optima. The solver splits the level into rooms and solves each room on its own with a breadth-first search over pushes (the first solved state a push-BFS meets is push-optimal), then stitches the rooms' moves together.

A push-state is the boxes' squares plus the player's reachable region (named by its lowest square). Two deadlocks are pruned: a box on a dead square, and a frozen 2x2 block of walls and boxes holding a box off its goal. The search is bounded by a fixed number of states, never by the clock, so two runs write identical bytes.

## Practice set

All five practice instances solved at exactly their push-optimum P*, for the maximum score of 1,000,000 (the house baseline plain-astar 1.0.0 scores 200,000 on the same set):

| instance | boxes | rooms | pushes | P\* |
| -------- | ----- | ----- | ------ | --- |
| i001 | 3 | 1 | 13 | 13 |
| i002 | 4 | 1 | 16 | 16 |
| i003 | 8 | 2 | 29 | 29 |
| i004 | 12 | 3 | 47 | 47 |
| i005 | 16 | 4 | 60 | 60 |

Total wall time for the whole set: about 1 second (budget 60 seconds).

## Usage

`main.ts` reads levels from `$MAKEFUN_INPUT_DIR` (default `/input`, one `level.txt` per instance directory) and writes `$MAKEFUN_OUTPUT_DIR/<id>/solution.txt` (the player's moves, `u`/`d`/`l`/`r`, one letter per step).

Local run:

```sh
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```
