import { useEffect, useRef, useState } from 'react'
import { ChillerEngine, type PlayerSnapshot } from './audio/ChillerEngine'
import { flavorTexts } from './flavorTexts'

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4.8c0-.8.9-1.3 1.6-.9l11 7.2a1.1 1.1 0 0 1 0 1.8l-11 7.2c-.7.4-1.6-.1-1.6-.9V4.8Z" fill="currentColor" /></svg>
  )
}

function NextIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4.5 5 10.5 7-10.5 7V5ZM18 5v14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

function VolumeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm13 0a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

const levels = [28, 49, 72, 44, 85, 58, 34, 65, 91, 51, 76, 41, 60, 33, 55, 80, 45, 69, 39, 62, 88, 48, 71, 34]
const sceneFrames = ['room-blink.png', 'room-look.png'].map((name) => `${import.meta.env.BASE_URL}${name}`)
const flavorTextStorageKey = 'chillermachine:last-flavor-text-index'

function chooseFlavorText() {
  let previousIndex = -1
  try {
    const storedIndex = window.localStorage.getItem(flavorTextStorageKey)
    if (storedIndex !== null) {
      const parsedIndex = Number(storedIndex)
      if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < flavorTexts.length) {
        previousIndex = parsedIndex
      }
    }
  } catch {
    // The text still changes randomly when storage is unavailable.
  }

  const availableCount = flavorTexts.length - (previousIndex >= 0 ? 1 : 0)
  const choice = Math.floor(Math.random() * availableCount)
  const index = previousIndex >= 0 && choice >= previousIndex ? choice + 1 : choice

  try {
    window.localStorage.setItem(flavorTextStorageKey, String(index))
  } catch {
    // Private browsing or disabled storage should not block the page.
  }
  return flavorTexts[index]
}

const flavorText = chooseFlavorText()
const longestFlavorLine = Math.max(...flavorText.map(line => [...line].length))
const flavorTitleClass = longestFlavorLine >= 8 ? 'flavor-eight' : longestFlavorLine === 7 ? 'flavor-seven' : ''

function randomDelay(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function App() {
  const engineRef = useRef<ChillerEngine | null>(null)
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null)
  const [pending, setPending] = useState(false)
  const [uiError, setUiError] = useState<string | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [blinking, setBlinking] = useState(false)
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    const engine = new ChillerEngine()
    engineRef.current = engine
    setSnapshot(engine.getSnapshot())
    const unsubscribe = engine.subscribe(setSnapshot)
    return () => {
      unsubscribe()
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setReducedMotion(media.matches)
    updateMotionPreference()
    media.addEventListener('change', updateMotionPreference)
    return () => media.removeEventListener('change', updateMotionPreference)
  }, [])

  useEffect(() => {
    let active = true
    const preload = (src: string) => new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`Could not load scene frame: ${src}`))
      image.src = src
    })

    Promise.all(sceneFrames.map(preload)).then(() => {
      if (active) setSceneReady(true)
    }).catch(() => {
      // Keep the original scene visible if a frame is unavailable.
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!sceneReady || reducedMotion) {
      setBlinking(false)
      setLooking(false)
      return
    }

    let blinkTimer: ReturnType<typeof setTimeout>
    let blinkEndTimer: ReturnType<typeof setTimeout>
    let lookTimer: ReturnType<typeof setTimeout>
    let lookEndTimer: ReturnType<typeof setTimeout>

    const scheduleBlink = (delay = randomDelay(3600, 8500)) => {
      blinkTimer = setTimeout(() => {
        setBlinking(true)
        blinkEndTimer = setTimeout(() => {
          setBlinking(false)
          scheduleBlink(Math.random() < 0.18 ? randomDelay(160, 260) : undefined)
        }, randomDelay(110, 170))
      }, delay)
    }

    const scheduleLook = (delay = randomDelay(8500, 17000)) => {
      lookTimer = setTimeout(() => {
        setLooking(true)
        lookEndTimer = setTimeout(() => {
          setLooking(false)
          scheduleLook(randomDelay(14000, 27000))
        }, randomDelay(1800, 3300))
      }, delay)
    }

    scheduleBlink()
    scheduleLook()
    return () => {
      clearTimeout(blinkTimer)
      clearTimeout(blinkEndTimer)
      clearTimeout(lookTimer)
      clearTimeout(lookEndTimer)
    }
  }, [sceneReady, reducedMotion])

  const playing = snapshot?.status === 'playing'
  const volume = snapshot?.volume ?? 0.7
  const error = uiError ?? snapshot?.error

  async function togglePlayback() {
    const engine = engineRef.current
    if (!engine || pending) return
    setPending(true)
    setUiError(null)
    try {
      if (playing) await engine.pause()
      else await engine.play()
    } catch (cause) {
      setUiError(cause instanceof Error ? cause.message : '音楽を再生できませんでした。もう一度お試しください。')
    } finally {
      setPending(false)
    }
  }

  async function nextTrack() {
    const engine = engineRef.current
    if (!engine || pending) return
    setPending(true)
    setUiError(null)
    try {
      await engine.next()
    } catch (cause) {
      setUiError(cause instanceof Error ? cause.message : '次の曲を作れませんでした。もう一度お試しください。')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="app-shell">
      <div className={`scene-art${sceneReady && !reducedMotion && blinking ? ' is-blinking' : ''}${sceneReady && !reducedMotion && looking ? ' is-looking' : ''}`} aria-hidden="true">
        <img className="scene-open" src={`${import.meta.env.BASE_URL}room-open.png`} alt="" />
        <img className="scene-look" src={`${import.meta.env.BASE_URL}room-look.png`} alt="" />
        <img className="scene-blink" src={`${import.meta.env.BASE_URL}room-blink.png`} alt="" />
      </div>
      <div className="scene-tint" aria-hidden="true" />
      <div className="scene-grain" aria-hidden="true" />

      <div className="scene-content">
        <header className="site-header">
          <div className="brand" aria-label="chillermachine">
            <span className="brand-cat" aria-hidden="true">⌁</span>
            <span>chiller<span>machine</span></span>
          </div>
        </header>

        <main className="main-layout">
          <section className="intro" aria-labelledby="page-title">
            <div className="eyebrow"><span /> LATE NIGHT RADIO</div>
            <h1 id="page-title" className={flavorTitleClass}>{flavorText[0]}<br />{flavorText[1]}</h1>
            <p>夜に似合う音を、ふたりで。<br />その瞬間だけのアンビエントを流します。</p>
            <div className="intro-signoff"><span className="sparkle">✦</span> LISTEN TOGETHER</div>
          </section>

          <section className={`player-card ${playing ? 'is-playing' : ''}`} aria-label="chillermachine music player">
            <div className="deck-header">
              <span className="deck-series">CHILLERMACHINE <span>／</span> NIGHT SESSION</span>
              <span className="deck-indicator"><span className="indicator-light" /> {playing ? 'ON AIR' : 'STANDBY'}</span>
            </div>

            <div className="cassette" aria-hidden="true">
              <span className="cassette-screw screw-one" /><span className="cassette-screw screw-two" />
              <span className="cassette-screw screw-three" /><span className="cassette-screw screw-four" />
              <div className="cassette-label">
                <div className="cassette-label-top"><span>chiller<span>machine</span></span><span>STEREO / ∞</span></div>
                <div className="cassette-window">
                  <span className="tape-bridge" />
                  <span className="reel reel-left"><span className="reel-hub" /></span>
                  <span className="reel reel-right"><span className="reel-hub" /></span>
                </div>
                <div className="cassette-caption"><span>SOUNDS FOR THE SLOW HOURS</span><span>SIDE A</span></div>
              </div>
              <div className="cassette-bottom"><span /><span /><span /><span /><span /></div>
            </div>

            <div className="deck-lower">
              <div className="track-info" aria-live="polite">
                <div className="now-playing-heading"><span className="live-dot" /> {playing ? 'NOW PLAYING' : 'READY WHEN YOU ARE'} <span className="heading-rule" /></div>
                <div className="track-row"><h2>{snapshot?.track.title ?? 'Finding your frequency'}</h2><span>{snapshot ? `#${String(Math.abs(snapshot.track.seed) % 10000).padStart(4, '0')}` : '#0001'}</span></div>
                <p className="track-variant">{snapshot?.track.ambientVariant ?? 'An endless moment'} <span>·</span> {snapshot?.track.bpm ?? '—'} BPM</p>
                <div className="sound-bars" aria-hidden="true">{levels.map((level, index) => <span key={index} style={{ height: `${level}%`, animationDelay: `${(index * 13) % 17 * -0.11}s` }} />)}</div>
              </div>
              <div className="controls">
                <div className="transport">
                  <button className="play-button" type="button" onClick={togglePlayback} disabled={!snapshot || pending} aria-label={playing ? '音楽を一時停止' : '音楽を再生'} aria-pressed={playing}><PlayIcon playing={playing} /><span>{playing ? 'PAUSE' : 'PLAY'}</span></button>
                  <button className="next-button" type="button" onClick={nextTrack} disabled={!snapshot || pending} aria-label="次の曲を生成" title="次の曲を生成"><NextIcon /></button>
                </div>
                <div className="volume-control"><VolumeIcon /><label htmlFor="volume">VOLUME</label><input id="volume" type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={event => engineRef.current?.setVolume(Number(event.target.value) / 100)} style={{ background: `linear-gradient(to right, #fb91cc ${volume * 100}%, #54465e ${volume * 100}%)` }} /><output htmlFor="volume">{Math.round(volume * 100)}%</output></div>
              </div>
            </div>
            {error && <p className="player-error" role="alert">{error}</p>}
          </section>
        </main>

        <footer className="site-footer"><span>© 2026 Takuma Komatsu</span><a href="https://github.com/takuma-komatsu/chillermachine" target="_blank" rel="noopener noreferrer">Source Code: GitHub</a></footer>
      </div>
    </div>
  )
}

export default App
