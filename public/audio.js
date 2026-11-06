// Áudio Sintetizado Arcade Retro usando Web Audio API
class ArcadeAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopSonar();
    }
    return this.muted;
  }

  playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.2) {
    if (this.muted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  // Som de clique nos botões
  click() {
    this.playTone(600, 'triangle', 0.05, 0.15);
  }

  // Som ao posicionar / selecionar navio
  place() {
    this.playTone(440, 'sine', 0.08, 0.2);
    setTimeout(() => this.playTone(880, 'sine', 0.08, 0.2), 60);
  }

  // Som ao rodar o navio
  rotate() {
    this.playTone(320, 'square', 0.06, 0.15);
    setTimeout(() => this.playTone(480, 'square', 0.06, 0.15), 50);
  }

  // Erro / Posição inválida
  error() {
    this.playTone(180, 'sawtooth', 0.15, 0.25);
    setTimeout(() => this.playTone(130, 'sawtooth', 0.2, 0.25), 100);
  }

  // Selecionar alvo para disparo
  target() {
    this.playTone(750, 'sine', 0.07, 0.2);
  }

  // Lançamento de míssil (Whoosh ascendente)
  launch() {
    if (this.muted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';

      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch (e) {}
  }

  // Água / Splash
  water() {
    if (this.muted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';

      osc.frequency.setValueAtTime(450, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (e) {}
  }

  // Tiro certeiro no barco (Explosão curta)
  hit() {
    if (this.muted) return;
    this.init();
    try {
      // Ruído branco para explosão
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
      whiteNoise.stop(this.ctx.currentTime + 0.4);
    } catch (e) {}
  }

  // Navio Afundado! (Alarme duplo + explosão épica)
  sunk() {
    this.hit();
    setTimeout(() => {
      this.playTone(400, 'square', 0.15, 0.3);
      setTimeout(() => this.playTone(300, 'square', 0.25, 0.3), 150);
      setTimeout(() => this.hit(), 300);
    }, 200);
  }

  // Fanfarra de Vitória
  victory() {
    const notes = [261.6, 329.6, 392.0, 523.25, 659.25, 784.0];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.2, 0.3);
      }, idx * 120);
    });
  }

  // Derrota
  defeat() {
    const notes = [392.0, 370.0, 349.2, 311.1];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'sawtooth', 0.3, 0.25);
      }, idx * 160);
    });
  }

  // Ping de Sonar Submarino Imersivo (Web Audio API)
  sonarPing() {
    if (this.muted) return;
    this.init();
    try {
      const now = this.ctx.currentTime;

      // Oscilador Principal (Ping Puro C6 / 1046.5 Hz com ligeiro glide)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      osc.frequency.exponentialRampToValueAtTime(1038, now + 1.2);

      // Envolvente com eco e cauda longa
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

      // Oscilador Secundário Harmónico Suave (2093 Hz)
      const oscHarmonic = this.ctx.createOscillator();
      const gainHarmonic = this.ctx.createGain();

      oscHarmonic.type = 'sine';
      oscHarmonic.frequency.setValueAtTime(2093, now);
      oscHarmonic.frequency.exponentialRampToValueAtTime(2076, now + 0.8);

      gainHarmonic.gain.setValueAtTime(0.001, now);
      gainHarmonic.gain.linearRampToValueAtTime(0.06, now + 0.03);
      gainHarmonic.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      oscHarmonic.connect(gainHarmonic);
      gainHarmonic.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 1.6);

      oscHarmonic.start(now);
      oscHarmonic.stop(now + 0.8);
    } catch (e) {}
  }

  // Temporizador Sonar de fundo contínuo
  startSonar(intervalMs = 3800) {
    if (this.sonarTimer) return;
    this.sonarPing();
    this.sonarTimer = setInterval(() => {
      this.sonarPing();
    }, intervalMs);
  }

  stopSonar() {
    if (this.sonarTimer) {
      clearInterval(this.sonarTimer);
      this.sonarTimer = null;
    }
  }
}

window.soundEngine = new ArcadeAudio();
