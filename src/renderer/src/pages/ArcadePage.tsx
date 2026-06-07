import { useState, useEffect } from 'react'
import { useIdleGameStore, prestigeMultiplier } from '../store/idleGameStore'
import PageShell from '../components/PageShell'
import IdleGame from '../components/IdleGame'
import Snake from '../components/Snake'
import Minesweeper from '../components/Minesweeper'
import MemoryMatch from '../components/MemoryMatch'
import Game2048 from '../components/Game2048'
import Breakout from '../components/Breakout'
import MazeGame from '../components/MazeGame'
import TextDungeon from '../components/TextDungeon'
import TowerDefense from '../components/TowerDefense'
import SlidingPuzzle from '../components/SlidingPuzzle'
import ConnectFour from '../components/ConnectFour'
import Solitaire from '../components/Solitaire'
import Tetris from '../components/Tetris'
import Shmup from '../components/Shmup'
import Pong from '../components/Pong'
import Wordle from '../components/Wordle'
import Glyph from '../components/Glyph'
import Sokoban from '../components/Sokoban'
import Reversi from '../components/Reversi'
import Quoridor from '../components/Quoridor'
import Asteroids from '../components/Asteroids'
import Pacman from '../components/Pacman'
import Frogger from '../components/Frogger'
import EndlessRunner from '../components/EndlessRunner'
import Survivors from '../components/Survivors'
import Roguelike from '../components/Roguelike'
import styles from './ArcadePage.module.css'

function fmt(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K'
  return Math.floor(n).toString()
}

function fmtRate(n: number): string {
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K'
  if (n >= 100)  return Math.floor(n).toString()
  if (n >= 1)    return n.toFixed(1)
  if (n > 0)     return n.toFixed(2)
  return '0'
}

export default function ArcadePage(): JSX.Element {
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [snakeBest, setSnakeBest] = useState(0)
  const [minesweeperBest, setMinesweeperBest] = useState<Record<string, number>>({})
  const [memoryBest, setMemoryBest] = useState<Record<string, number>>({})
  const [game2048Best, setGame2048Best] = useState(0)
  const [breakoutBest, setBreakoutBest] = useState(0)
  const [mazeBest, setMazeBest] = useState<Record<string, number>>({})
  const [dungeonBest, setDungeonBest] = useState(0)
  const [towerDefenseBest, setTowerDefenseBest] = useState(0)
  const [slidingPuzzleBest, setSlidingPuzzleBest] = useState<Record<string, number>>({})
  const [connectFourRecord, setConnectFourRecord] = useState<{ wins: number; losses: number; draws: number }>({ wins: 0, losses: 0, draws: 0 })
  const [solitaireWins, setSolitaireWins] = useState(0)
  const [tetrisHi, setTetrisHi] = useState(0)
  const [shmupHi, setShmupHi] = useState(0)
  const [pongRecord, setPongRecord] = useState<{ wins: number; losses: number }>({ wins: 0, losses: 0 })
  const [wordleStreak, setWordleStreak] = useState(0)
  const [sokobanCleared, setSokobanCleared] = useState(0)
  const [reversiRecord, setReversiRecord] = useState<{ wins: number; losses: number; draws: number }>({ wins: 0, losses: 0, draws: 0 })
  const [quoridorRecord, setQuoridorRecord] = useState<{ wins: number; losses: number }>({ wins: 0, losses: 0 })
  const [asteroidsHi, setAsteroidsHi] = useState(0)
  const [pacmanHi, setPacmanHi] = useState(0)
  const [froggerHi, setFroggerHi] = useState(0)
  const [runnerHi, setRunnerHi] = useState<{ side: number; lane: number; gravity: number }>({ side: 0, lane: 0, gravity: 0 })
  const [survivorsBest, setSurvivorsBest] = useState<{ time: number; kills: number }>({ time: 0, kills: 0 })
  const [roguelikeSouls, setRoguelikeSouls] = useState(0)

  const { files, prestigeCount, shows, paused, togglePause } = useIdleGameStore()
  const mult = prestigeMultiplier(prestigeCount)
  const passiveRate = shows.reduce((sum, sh) => sum + sh.count * sh.baseRate, 0) * mult

  useEffect(() => {
    window.api.settings.get('snakeHighScore', '0').then(v => {
      setSnakeBest(parseInt(v, 10) || 0)
    })
    window.api.settings.get('minesweeperBest', '{}').then(v => {
      try { setMinesweeperBest(JSON.parse(v) as Record<string, number>) } catch { /* ignore */ }
    })
    window.api.settings.get('memoryBest', '{}').then(v => {
      try { setMemoryBest(JSON.parse(v) as Record<string, number>) } catch { /* ignore */ }
    })
    window.api.settings.get('game2048Best', '{}').then(v => {
      try { const data = JSON.parse(v) as { score?: number }; setGame2048Best(data.score ?? 0) } catch { /* ignore */ }
    })
    window.api.settings.get('breakoutBest', '{}').then(v => {
      try { const data = JSON.parse(v) as { score?: number }; setBreakoutBest(data.score ?? 0) } catch { /* ignore */ }
    })
    window.api.settings.get('mazeBest', '{}').then(v => {
      try { setMazeBest(JSON.parse(v) as Record<string, number>) } catch { /* ignore */ }
    })
    window.api.settings.get('textDungeonBest', '{}').then(v => {
      try { const data = JSON.parse(v) as { score?: number }; setDungeonBest(data.score ?? 0) } catch { /* ignore */ }
    })
    window.api.settings.get('towerDefenseBest', '{}').then(v => {
      try { const data = JSON.parse(v) as { score?: number }; setTowerDefenseBest(data.score ?? 0) } catch { /* ignore */ }
    })
    window.api.settings.get('slidingPuzzleBest', '{}').then(v => {
      try { setSlidingPuzzleBest(JSON.parse(v) as Record<string, number>) } catch { /* ignore */ }
    })
    window.api.settings.get('solitaireWins', '0').then(v => {
      setSolitaireWins(parseInt(v, 10) || 0)
    })
    window.api.settings.get('tetrisHighScore', '0').then(v => {
      setTetrisHi(parseInt(v, 10) || 0)
    })
    window.api.settings.get('shmupHighScore', '0').then(v => {
      setShmupHi(parseInt(v, 10) || 0)
    })
    window.api.settings.get('connectFourWins', '{}').then(v => {
      try {
        const data = JSON.parse(v) as { wins?: number; losses?: number; draws?: number }
        setConnectFourRecord({ wins: data.wins ?? 0, losses: data.losses ?? 0, draws: data.draws ?? 0 })
      } catch { /* ignore */ }
    })
    window.api.settings.get('pongRecord', '{}').then(v => {
      try {
        const data = JSON.parse(v) as { wins?: number; losses?: number }
        setPongRecord({ wins: data.wins ?? 0, losses: data.losses ?? 0 })
      } catch { /* ignore */ }
    })
    window.api.settings.get('wordleStats', '{}').then(v => {
      try {
        const data = JSON.parse(v) as { bestStreak?: number }
        setWordleStreak(data.bestStreak ?? 0)
      } catch { /* ignore */ }
    })
    window.api.settings.get('sokobanProgress', '{}').then(v => {
      try {
        const data = JSON.parse(v) as { bestMoves?: number[] }
        const arr = data.bestMoves ?? []
        setSokobanCleared(arr.filter((m) => m > 0).length)
      } catch { /* ignore */ }
    })
    window.api.settings.get('reversiRecord', '{}').then(v => {
      try {
        const data = JSON.parse(v) as { wins?: number; losses?: number; draws?: number }
        setReversiRecord({ wins: data.wins ?? 0, losses: data.losses ?? 0, draws: data.draws ?? 0 })
      } catch { /* ignore */ }
    })
    window.api.settings.get('quoridorRecord', '{}').then(v => {
      try {
        const data = JSON.parse(v) as { wins?: number; losses?: number }
        setQuoridorRecord({ wins: data.wins ?? 0, losses: data.losses ?? 0 })
      } catch { /* ignore */ }
    })
    window.api.settings.get('asteroidsHighScore', '0').then(v => {
      setAsteroidsHi(parseInt(v, 10) || 0)
    })
    window.api.settings.get('pacmanHighScore', '0').then(v => {
      setPacmanHi(parseInt(v, 10) || 0)
    })
    window.api.settings.get('froggerHighScore', '0').then(v => {
      setFroggerHi(parseInt(v, 10) || 0)
    })
    void (async () => {
      const [s, l, g] = await Promise.all([
        window.api.settings.get('runnerHighScore_side', '0'),
        window.api.settings.get('runnerHighScore_lane', '0'),
        window.api.settings.get('runnerHighScore_gravity', '0')
      ])
      setRunnerHi({ side: parseInt(s, 10) || 0, lane: parseInt(l, 10) || 0, gravity: parseInt(g, 10) || 0 })
    })()
    window.api.settings.get('survivorsBest', '{}').then(v => {
      try {
        const d = JSON.parse(v) as { time?: number; kills?: number }
        setSurvivorsBest({ time: d.time ?? 0, kills: d.kills ?? 0 })
      } catch { /* ignore */ }
    })
    window.api.settings.get('roguelikeMeta', '{}').then(v => {
      try {
        const d = JSON.parse(v) as { souls?: number }
        setRoguelikeSouls(d.souls ?? 0)
      } catch { /* ignore */ }
    })
  }, [])

  function toggleCard(id: string): void {
    setOpenCard(prev => prev === id ? null : id)
  }

  return (
    <PageShell title="Arcade">
      <div className={styles.gameList}>

        {/* ── Vault Clicker ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGold}`} onClick={() => toggleCard('idle')}>
            <span className={`${styles.cardTitle} ${styles.titleGold}`}>🎮 Vault Clicker</span>
            <span className={styles.cardMeta}>
              {fmt(files)} files
              {paused
                ? <span className={styles.metaPaused}> · paused</span>
                : passiveRate > 0 && <span className={styles.metaRateGold}> · +{fmtRate(passiveRate)}/s</span>
              }
              {prestigeCount > 0 && <span className={styles.metaPrestige}> · ×{mult}</span>}
            </span>
            <button
              className={`${styles.pauseBtn} ${styles.pauseBtnGold}`}
              onClick={e => { e.stopPropagation(); togglePause() }}
              title={paused ? 'Resume' : 'Pause'}
            >
              {paused ? '▶' : '⏸'}
            </button>
            <span className={styles.cardChevron}>{openCard === 'idle' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'idle' && <IdleGame />}
        </div>

        {/* ── Snake ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGreen}`} onClick={() => toggleCard('snake')}>
            <span className={`${styles.cardTitle} ${styles.titleGreen}`}>🐍 Snake</span>
            <span className={styles.cardMeta}>
              {snakeBest > 0
                ? <span className={styles.metaRateGreen}>best {snakeBest}</span>
                : 'Arrow keys · WASD'
              }
            </span>
            <span className={styles.cardChevron}>{openCard === 'snake' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'snake' && <Snake onNewBest={n => setSnakeBest(n)} />}
        </div>

        {/* ── Minesweeper ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardRed}`} onClick={() => toggleCard('minesweeper')}>
            <span className={`${styles.cardTitle} ${styles.titleRed}`}>🧨 Minesweeper</span>
            <span className={styles.cardMeta}>
              {minesweeperBest.beginner ? `best: ${minesweeperBest.beginner}s` : 'Point and click classic'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'minesweeper' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'minesweeper' && <Minesweeper onNewBest={(d, t) => setMinesweeperBest({...minesweeperBest, [d]: t})} />}
        </div>

        {/* ── Memory Match ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardPurple}`} onClick={() => toggleCard('memory')}>
            <span className={`${styles.cardTitle} ${styles.titlePurple}`}>🃏 Memory Match</span>
            <span className={styles.cardMeta}>
              {(() => {
                const parts: string[] = []
                if (memoryBest[4]) parts.push(`4×4: ${memoryBest[4]}`)
                if (memoryBest[6]) parts.push(`6×6: ${memoryBest[6]}`)
                if (memoryBest[8]) parts.push(`8×8: ${memoryBest[8]}`)
                return parts.length ? `best — ${parts.join(' · ')}` : 'Flip and match pairs'
              })()}
            </span>
            <span className={styles.cardChevron}>{openCard === 'memory' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'memory' && <MemoryMatch onNewBest={(s, f) => setMemoryBest({...memoryBest, [s]: f})} />}
        </div>

        {/* ── 2048 ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardCyan}`} onClick={() => toggleCard('2048')}>
            <span className={`${styles.cardTitle} ${styles.titleCyan}`}>🎲 2048</span>
            <span className={styles.cardMeta}>
              {game2048Best > 0 ? `best ${fmt(game2048Best)}` : 'Merge tiles to victory'}
            </span>
            <span className={styles.cardChevron}>{openCard === '2048' ? '▲' : '▼'}</span>
          </button>
          {openCard === '2048' && <Game2048 onNewBest={s => setGame2048Best(s)} />}
        </div>

        {/* ── Breakout ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardOrange}`} onClick={() => toggleCard('breakout')}>
            <span className={`${styles.cardTitle} ${styles.titleOrange}`}>🧱 Breakout</span>
            <span className={styles.cardMeta}>
              {breakoutBest > 0 ? `best ${breakoutBest}` : 'Bounce, smash, repeat'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'breakout' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'breakout' && <Breakout onNewBest={s => setBreakoutBest(s)} />}
        </div>

        {/* ── Pong ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardBlue}`} onClick={() => toggleCard('pong')}>
            <span className={`${styles.cardTitle} ${styles.titleBlue}`}>🏓 Pong</span>
            <span className={styles.cardMeta}>
              {pongRecord.wins + pongRecord.losses > 0
                ? `${pongRecord.wins}W · ${pongRecord.losses}L`
                : 'Outrally the CPU'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'pong' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'pong' && <Pong />}
        </div>

        {/* ── Wordle ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGreen}`} onClick={() => toggleCard('wordle')}>
            <span className={`${styles.cardTitle} ${styles.titleGreen}`}>🔤 Wordle</span>
            <span className={styles.cardMeta}>
              {wordleStreak > 0 ? `best streak ${wordleStreak}` : 'Guess the 5-letter word'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'wordle' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'wordle' && <Wordle />}
        </div>

        {/* ── Sokoban ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardRed}`} onClick={() => toggleCard('sokoban')}>
            <span className={`${styles.cardTitle} ${styles.titleRed}`}>📦 Sokoban</span>
            <span className={styles.cardMeta}>
              {sokobanCleared > 0 ? `${sokobanCleared} / 155 levels cleared` : 'Push boxes onto targets'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'sokoban' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'sokoban' && <Sokoban />}
        </div>

        {/* ── Reversi ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardPurple}`} onClick={() => toggleCard('reversi')}>
            <span className={`${styles.cardTitle} ${styles.titlePurple}`}>⚫ Reversi</span>
            <span className={styles.cardMeta}>
              {reversiRecord.wins + reversiRecord.losses + reversiRecord.draws > 0
                ? `${reversiRecord.wins}W · ${reversiRecord.losses}L · ${reversiRecord.draws}D`
                : 'Flank to flip the board'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'reversi' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'reversi' && <Reversi />}
        </div>

        {/* ── Quoridor ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardOrange}`} onClick={() => toggleCard('quoridor')}>
            <span className={`${styles.cardTitle} ${styles.titleOrange}`}>🏰 Quoridor</span>
            <span className={styles.cardMeta}>
              {quoridorRecord.wins + quoridorRecord.losses > 0
                ? `${quoridorRecord.wins}W · ${quoridorRecord.losses}L`
                : 'Wall off your opponent'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'quoridor' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'quoridor' && <Quoridor />}
        </div>

        {/* ── Asteroids ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardCyan}`} onClick={() => toggleCard('asteroids')}>
            <span className={`${styles.cardTitle} ${styles.titleCyan}`}>🚀 Asteroids</span>
            <span className={styles.cardMeta}>
              {asteroidsHi > 0 ? `best ${fmt(asteroidsHi)}` : 'Drift, shoot, survive'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'asteroids' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'asteroids' && <Asteroids />}
        </div>

        {/* ── Pac-Man ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardOrange}`} onClick={() => toggleCard('pacman')}>
            <span className={`${styles.cardTitle} ${styles.titleOrange}`}>👻 Pac-Man</span>
            <span className={styles.cardMeta}>
              {pacmanHi > 0 ? `best ${fmt(pacmanHi)}` : 'Eat pellets, dodge ghosts'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'pacman' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'pacman' && <Pacman />}
        </div>

        {/* ── Roguelike ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGold}`} onClick={() => toggleCard('roguelike')}>
            <span className={`${styles.cardTitle} ${styles.titleGold}`}>⚔ Soul Forge</span>
            <span className={styles.cardMeta}>
              {roguelikeSouls > 0 ? `${fmt(roguelikeSouls)} souls forged` : '6 floors · permadeath · soul forge'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'roguelike' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'roguelike' && <Roguelike />}
        </div>

        {/* ── Survivors ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardPurple}`} onClick={() => toggleCard('survivors')}>
            <span className={`${styles.cardTitle} ${styles.titlePurple}`}>🧛 Survivors</span>
            <span className={styles.cardMeta}>
              {survivorsBest.time > 0
                ? `best ${Math.floor(survivorsBest.time / 60)}:${(survivorsBest.time % 60).toString().padStart(2, '0')} · ${survivorsBest.kills}k`
                : 'Survive 10 minutes against the horde'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'survivors' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'survivors' && <Survivors />}
        </div>

        {/* ── Endless Runner ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardOrange}`} onClick={() => toggleCard('runner')}>
            <span className={`${styles.cardTitle} ${styles.titleOrange}`}>🏃 Endless Runner</span>
            <span className={styles.cardMeta}>
              {(runnerHi.side > 0 || runnerHi.lane > 0 || runnerHi.gravity > 0)
                ? `side ${fmt(runnerHi.side)} · lane ${fmt(runnerHi.lane)} · grav ${fmt(runnerHi.gravity)}`
                : 'Side · lane · gravity — pick your run'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'runner' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'runner' && <EndlessRunner />}
        </div>

        {/* ── Glyph ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardBlue}`} onClick={() => toggleCard('glyph')}>
            <span className={`${styles.cardTitle} ${styles.titleBlue}`}>🔮 Glyph</span>
            <span className={styles.cardMeta}>Decode the word within</span>
            <span className={styles.cardChevron}>{openCard === 'glyph' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'glyph' && <Glyph />}
        </div>

        {/* ── Frogger ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGreen}`} onClick={() => toggleCard('frogger')}>
            <span className={`${styles.cardTitle} ${styles.titleGreen}`}>🐸 Frogger</span>
            <span className={styles.cardMeta}>
              {froggerHi > 0 ? `best ${fmt(froggerHi)}` : 'Hop the road and river'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'frogger' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'frogger' && <Frogger />}
        </div>

        {/* ── Maze ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardBlue}`} onClick={() => toggleCard('maze')}>
            <span className={`${styles.cardTitle} ${styles.titleBlue}`}>🌀 Maze</span>
            <span className={styles.cardMeta}>
              {(() => {
                const parts: string[] = []
                if (mazeBest.small)  parts.push(`S: ${mazeBest.small}s`)
                if (mazeBest.medium) parts.push(`M: ${mazeBest.medium}s`)
                if (mazeBest.large)  parts.push(`L: ${mazeBest.large}s`)
                if (mazeBest.huge)   parts.push(`H: ${mazeBest.huge}s`)
                return parts.length ? `best — ${parts.join(' · ')}` : 'Find your way out'
              })()}
            </span>
            <span className={styles.cardChevron}>{openCard === 'maze' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'maze' && <MazeGame onNewBest={(s, t) => setMazeBest({ ...mazeBest, [s]: t })} />}
        </div>

        {/* ── Text Dungeon ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardRed}`} onClick={() => toggleCard('dungeon')}>
            <span className={`${styles.cardTitle} ${styles.titleRed}`}>📜 Text Dungeon</span>
            <span className={styles.cardMeta}>
              {dungeonBest > 0 ? `best ${dungeonBest}` : 'Adventure awaits'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'dungeon' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'dungeon' && <TextDungeon onNewBest={s => setDungeonBest(s)} />}
        </div>

        {/* ── Tower Defense ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGreen}`} onClick={() => toggleCard('towerdefense')}>
            <span className={`${styles.cardTitle} ${styles.titleGreen}`}>🗼 Tower Defense</span>
            <span className={styles.cardMeta}>
              {towerDefenseBest > 0 ? `best ${towerDefenseBest}` : 'Hold the line'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'towerdefense' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'towerdefense' && <TowerDefense />}
        </div>

        {/* ── Sliding Puzzle ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardPurple}`} onClick={() => toggleCard('slidingpuzzle')}>
            <span className={`${styles.cardTitle} ${styles.titlePurple}`}>🔢 Sliding Puzzle</span>
            <span className={styles.cardMeta}>
              {slidingPuzzleBest['3'] ? `best 3×3: ${slidingPuzzleBest['3']} moves` : 'Slide tiles into order'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'slidingpuzzle' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'slidingpuzzle' && <SlidingPuzzle />}
        </div>

        {/* ── Connect Four ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardRed}`} onClick={() => toggleCard('connectfour')}>
            <span className={`${styles.cardTitle} ${styles.titleRed}`}>🔴 Connect Four</span>
            <span className={styles.cardMeta}>
              {connectFourRecord.wins + connectFourRecord.losses + connectFourRecord.draws > 0
                ? `${connectFourRecord.wins}W · ${connectFourRecord.losses}L · ${connectFourRecord.draws}D`
                : 'Outwit the AI'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'connectfour' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'connectfour' && <ConnectFour />}
        </div>

        {/* ── Solitaire ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGreen}`} onClick={() => toggleCard('solitaire')}>
            <span className={`${styles.cardTitle} ${styles.titleGreen}`}>♠ Solitaire</span>
            <span className={styles.cardMeta}>
              {solitaireWins > 0 ? `${solitaireWins} wins` : 'Klondike, one card at a time'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'solitaire' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'solitaire' && <Solitaire />}
        </div>

        {/* ── Tetris ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardCyan}`} onClick={() => toggleCard('tetris')}>
            <span className={`${styles.cardTitle} ${styles.titleCyan}`}>▦ Tetris</span>
            <span className={styles.cardMeta}>
              {tetrisHi > 0 ? `best ${fmt(tetrisHi)}` : 'Stack and clear'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'tetris' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'tetris' && <Tetris />}
        </div>

        {/* ── Shoot 'em Up ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardOrange}`} onClick={() => toggleCard('shmup')}>
            <span className={`${styles.cardTitle} ${styles.titleOrange}`}>✦ Shoot 'em Up</span>
            <span className={styles.cardMeta}>
              {shmupHi > 0 ? `best ${fmt(shmupHi)}` : 'Hold the line — in space'}
            </span>
            <span className={styles.cardChevron}>{openCard === 'shmup' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'shmup' && <Shmup />}
        </div>

      </div>
    </PageShell>
  )
}
