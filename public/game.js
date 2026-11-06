// ============================================================
// BATALHA NAVAL ARCADE - CLIENT LOGIC (game.js)
// ============================================================

(function () {
  'use strict';

  const socket = io();
  const audio = window.soundEngine;

  // Definições da Frota Clássica (8 Navios, 20 Blocos no total)
  const SHIP_TEMPLATES = [
    { type: 'carrier_t', name: 'Porta-Aviões', size: 5, shape: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]] },
    { type: 'battleship', name: 'Couraçado', size: 4, shape: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { type: 'destroyer_1', name: 'Contratorpedeiro 1', size: 3, shape: [[0, 0], [0, 1], [0, 2]] },
    { type: 'destroyer_2', name: 'Contratorpedeiro 2', size: 3, shape: [[0, 0], [0, 1], [0, 2]] },
    { type: 'patrol', name: 'Torpedeiro', size: 2, shape: [[0, 0], [0, 1]] },
    { type: 'sub_1', name: 'Submarino 1', size: 1, shape: [[0, 0]] },
    { type: 'sub_2', name: 'Submarino 2', size: 1, shape: [[0, 0]] },
    { type: 'sub_3', name: 'Submarino 3', size: 1, shape: [[0, 0]] }
  ];

  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  // Estado do Jogo no Cliente
  const state = {
    roomId: null,
    playerNumber: null,
    fleet: [], // navios posicionados: { id, type, name, coords: ["r,c", ...] }
    selectedShipIndex: 0,
    currentRotation: 0, // 0 = 0deg, 1 = 90deg, 2 = 180deg, 3 = 270deg
    hoverCell: null, // { r, c } onde o cursor está sobre a grelha
    shotsToFire: [], // array com até 3 {row, col}
    isMyTurn: false,
    enemyShipsLeft: 8,
    myShipsLeft: 8,
    shotsFiredHistory: new Set(),
    activeMobileTab: 'attack', // 'attack' | 'defense'
    // Histórico de hits em navios para atualizar gráficos riscados
    enemyShipsDamage: {}, // { [shipId/shipType]: count }
    myShipsDamage: {}
  };

  // Elementos do DOM
  const screens = {
    lobby: document.getElementById('screen-lobby'),
    waiting: document.getElementById('screen-waiting'),
    setup: document.getElementById('screen-setup'),
    battle: document.getElementById('screen-battle')
  };

  const elements = {
    btnCreateGame: document.getElementById('btn-create-game'),
    btnJoinGame: document.getElementById('btn-join-game'),
    roomInput: document.getElementById('room-input'),
    displayRoomCode: document.getElementById('display-room-code'),
    btnShareWhatsapp: document.getElementById('btn-share-whatsapp'),
    btnCopyLink: document.getElementById('btn-copy-link'),
    copyFeedback: document.getElementById('copy-feedback'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),

    // Popup de combate
    combatBannerPopup: document.getElementById('combat-banner-popup'),
    bannerIcon: document.getElementById('banner-icon'),
    bannerText: document.getElementById('banner-text'),

    // Setup
    setupGrid: document.getElementById('setup-grid'),
    shipsList: document.getElementById('ships-list'),
    placedCount: document.getElementById('placed-count'),
    btnRotateShip: document.getElementById('btn-rotate-ship'),
    rotationDisplay: document.getElementById('rotation-display'),
    btnAutoPlace: document.getElementById('btn-auto-place'),
    btnClearFleet: document.getElementById('btn-clear-fleet'),
    btnConfirmFleet: document.getElementById('btn-confirm-fleet'),
    setupStatusMsg: document.getElementById('setup-status-msg'),
    setupWaitingOpponent: document.getElementById('setup-waiting-opponent'),

    // Battle
    tabAttack: document.getElementById('tab-attack'),
    tabDefense: document.getElementById('tab-defense'),
    arenaAttack: document.getElementById('arena-attack'),
    arenaDefense: document.getElementById('arena-defense'),
    attackGrid: document.getElementById('attack-grid'),
    defenseGrid: document.getElementById('defense-grid'),
    turnBanner: document.getElementById('turn-banner'),
    turnStatusText: document.getElementById('turn-status-text'),
    battleWaitingAlert: document.getElementById('battle-waiting-alert'),
    btnFireSalvo: document.getElementById('btn-fire-salvo'),
    slots: [
      document.getElementById('slot-0'),
      document.getElementById('slot-1'),
      document.getElementById('slot-2')
    ],
    enemyShipsLeft: document.getElementById('enemy-ships-left'),
    myShipsLeft: document.getElementById('my-ships-left'),
    enemyFleetChecklist: document.getElementById('enemy-fleet-checklist'),
    myFleetChecklist: document.getElementById('my-fleet-checklist'),
    battleLog: document.getElementById('battle-log'),

    // Game Over
    modalGameOver: document.getElementById('modal-gameover'),
    gameoverIcon: document.getElementById('gameover-icon'),
    gameoverTitle: document.getElementById('gameover-title'),
    gameoverDesc: document.getElementById('gameover-desc'),
    btnRematch: document.getElementById('btn-rematch'),
    btnReturnLobby: document.getElementById('btn-return-lobby'),
    rematchStatus: document.getElementById('rematch-status')
  };

  // Popup de Alerta de Combate (Ex: TIRO NO PORTA-AVIÕES! / PORTA-AVIÕES AO FUNDO!)
  let bannerTimeout = null;
  function showCombatPopup(icon, text, duration = 2200) {
    if (bannerTimeout) clearTimeout(bannerTimeout);
    elements.bannerIcon.textContent = icon;
    elements.bannerText.textContent = text;
    elements.combatBannerPopup.classList.remove('hidden');

    bannerTimeout = setTimeout(() => {
      elements.combatBannerPopup.classList.add('hidden');
    }, duration);
  }

  // Troca de Tela
  function showScreen(screenKey) {
    Object.values(screens).forEach(scr => scr.classList.remove('active'));
    if (screens[screenKey]) {
      screens[screenKey].classList.add('active');
    }
  }

  // Rotação de Formas 2D
  function rotateShape(shape, rot) {
    let current = shape.map(([r, c]) => [r, c]);
    for (let i = 0; i < rot; i++) {
      // Girar 90 graus: (r, c) -> (c, -r)
      current = current.map(([r, c]) => [c, -r]);
    }
    const minR = Math.min(...current.map(([r]) => r));
    const minC = Math.min(...current.map(([, c]) => c));
    return current.map(([r, c]) => [r - minR, c - minC]);
  }

  // Gera as coordenadas absolutas dado o ponto de ancoragem (r, c)
  function getShipAbsoluteCoords(template, rot, startR, startC) {
    const rotated = rotateShape(template.shape, rot);
    return rotated.map(([dr, dc]) => [startR + dr, startC + dc]);
  }

  // Validação Estrita: Dentro do Tabuleiro + Sem Colisão + SEM COLAR (Regra de Vizinhança)
  function isValidPlacement(shipCoords, placedShips, excludeShipId = null) {
    const occupiedCoords = new Set();
    const forbiddenNeighborhood = new Set();

    for (const ship of placedShips) {
      if (ship.id === excludeShipId) continue;
      for (const coordStr of ship.coords) {
        occupiedCoords.add(coordStr);
        const [sr, sc] = coordStr.split(',').map(Number);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            forbiddenNeighborhood.add(`${sr + dr},${sc + dc}`);
          }
        }
      }
    }

    for (const [r, c] of shipCoords) {
      if (r < 0 || r >= 10 || c < 0 || c >= 10) return false;
      const key = `${r},${c}`;
      if (occupiedCoords.has(key)) return false;
      if (forbiddenNeighborhood.has(key)) return false;
    }

    return true;
  }

  // ================= CONSTRUÇÃO DAS GRELHAS =================
  function createGridDOM(container, onClickCell, onHoverCell, onLeaveCell) {
    container.innerHTML = '';

    const emptyOrigin = document.createElement('div');
    emptyOrigin.className = 'grid-header-cell';
    container.appendChild(emptyOrigin);

    for (let c = 0; c < 10; c++) {
      const colHead = document.createElement('div');
      colHead.className = 'grid-header-cell';
      colHead.textContent = COLS[c];
      container.appendChild(colHead);
    }

    for (let r = 0; r < 10; r++) {
      const rowHead = document.createElement('div');
      rowHead.className = 'grid-header-cell';
      rowHead.textContent = r + 1;
      container.appendChild(rowHead);

      for (let c = 0; c < 10; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.dataset.coord = `${r},${c}`;

        if (onClickCell) {
          cell.addEventListener('click', () => onClickCell(r, c, cell));
        }
        if (onHoverCell) {
          cell.addEventListener('mouseenter', () => onHoverCell(r, c, cell));
        }
        if (onLeaveCell) {
          cell.addEventListener('mouseleave', () => onLeaveCell(r, c, cell));
        }

        container.appendChild(cell);
      }
    }
  }

  // ================= FASE DE SETUP (MONTAGEM DA FROTA) =================
  function initSetupScreen() {
    state.fleet = [];
    state.selectedShipIndex = 0;
    state.currentRotation = 0;
    state.hoverCell = null;
    updateRotationButtonText();
    elements.setupWaitingOpponent.classList.add('hidden');
    elements.btnConfirmFleet.disabled = true;

    createGridDOM(elements.setupGrid, handleSetupGridClick, handleSetupGridHover, handleSetupGridLeave);
    setupRotationShortcuts();
    renderShipsDock();
    updateSetupStatus();
  }

  // Rotação dinâmica antes de fixar (botão direito, tecla R, roda do rato)
  function rotateCurrentShip() {
    audio.rotate();
    state.currentRotation = (state.currentRotation + 1) % 4;
    updateRotationButtonText();
    if (state.hoverCell) {
      handleSetupGridHover(state.hoverCell.r, state.hoverCell.c);
    }
  }

  function setupRotationShortcuts() {
    // 1. Botão direito do rato roda antes de fixar
    elements.setupGrid.oncontextmenu = (e) => {
      e.preventDefault();
      rotateCurrentShip();
    };

    // 2. Roda do rato roda o navio
    elements.setupGrid.onwheel = (e) => {
      e.preventDefault();
      rotateCurrentShip();
    };

    // 3. Teclado (R ou Barra de Espaço)
    window.onkeydown = (e) => {
      if (screens.setup.classList.contains('active')) {
        if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
          e.preventDefault();
          rotateCurrentShip();
        }
      }
    };
  }

  function renderShipsDock() {
    elements.shipsList.innerHTML = '';

    SHIP_TEMPLATES.forEach((tmpl, idx) => {
      const isPlaced = state.fleet.some(s => s.type === tmpl.type);
      const isSelected = state.selectedShipIndex === idx;

      const item = document.createElement('div');
      item.className = `ship-item ${isPlaced ? 'placed' : ''} ${isSelected ? 'selected' : ''}`;
      
      const info = document.createElement('div');
      info.className = 'ship-info';
      info.innerHTML = `
        <span class="ship-name">${tmpl.name}</span>
        <span class="ship-desc">${tmpl.size} quadrados ${isPlaced ? '• [Colocado]' : ''}</span>
      `;

      const preview = document.createElement('div');
      preview.className = 'ship-preview-blocks';
      for (let b = 0; b < Math.min(tmpl.size, 5); b++) {
        const blk = document.createElement('div');
        blk.className = 'preview-block';
        preview.appendChild(blk);
      }

      item.appendChild(info);
      item.appendChild(preview);

      item.addEventListener('click', () => {
        audio.click();
        state.selectedShipIndex = idx;
        renderShipsDock();
        if (state.hoverCell) {
          handleSetupGridHover(state.hoverCell.r, state.hoverCell.c);
        }
      });

      elements.shipsList.appendChild(item);
    });

    elements.placedCount.textContent = state.fleet.length;
  }

  function updateRotationButtonText() {
    const labels = ['HORIZONTAL', 'VERTICAL (90°)', 'INVERTIDO (180°)', 'VERTICAL (270°)'];
    elements.rotationDisplay.textContent = labels[state.currentRotation];
  }

  function updateSetupStatus() {
    const count = state.fleet.length;
    elements.placedCount.textContent = count;
    if (count === 8) {
      elements.btnConfirmFleet.disabled = false;
      elements.setupStatusMsg.textContent = 'Frota posicionada! Clica no botão para confirmar.';
      elements.setupStatusMsg.style.color = 'var(--neon-green)';
    } else {
      elements.btnConfirmFleet.disabled = true;
      elements.setupStatusMsg.textContent = `Faltam posicionar ${8 - count} navios.`;
      elements.setupStatusMsg.style.color = 'var(--neon-yellow)';
    }
  }

  function redrawSetupGrid() {
    const allCells = elements.setupGrid.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
      cell.className = 'grid-cell';
      cell.dataset.shipId = '';
    });

    for (const ship of state.fleet) {
      for (const coordStr of ship.coords) {
        const cell = elements.setupGrid.querySelector(`[data-coord="${coordStr}"]`);
        if (cell) {
          cell.classList.add('ship-cell');
          cell.dataset.shipId = ship.id;
        }
      }
    }
  }

  function handleSetupGridHover(r, c) {
    state.hoverCell = { r, c };
    clearGridPreviews();
    const currentTmpl = SHIP_TEMPLATES[state.selectedShipIndex];
    if (!currentTmpl) return;

    if (state.fleet.some(s => s.type === currentTmpl.type)) return;

    const absCoords = getShipAbsoluteCoords(currentTmpl, state.currentRotation, r, c);
    const valid = isValidPlacement(absCoords, state.fleet);

    absCoords.forEach(([cr, cc]) => {
      if (cr >= 0 && cr < 10 && cc >= 0 && cc < 10) {
        const cell = elements.setupGrid.querySelector(`[data-coord="${cr},${cc}"]`);
        if (cell) {
          cell.classList.add(valid ? 'preview-valid' : 'preview-invalid');
        }
      }
    });
  }

  function handleSetupGridLeave() {
    state.hoverCell = null;
    clearGridPreviews();
  }

  function clearGridPreviews() {
    const cells = elements.setupGrid.querySelectorAll('.preview-valid, .preview-invalid');
    cells.forEach(c => c.classList.remove('preview-valid', 'preview-invalid'));
  }

  function handleSetupGridClick(r, c, cell) {
    // Se clicou num navio já colocado, remove-o para reposicionar
    if (cell.dataset.shipId) {
      const shipId = cell.dataset.shipId;
      const foundIdx = state.fleet.findIndex(s => s.id === shipId);
      if (foundIdx !== -1) {
        const removed = state.fleet.splice(foundIdx, 1)[0];
        audio.place();
        const tmplIdx = SHIP_TEMPLATES.findIndex(t => t.type === removed.type);
        if (tmplIdx !== -1) state.selectedShipIndex = tmplIdx;
        redrawSetupGrid();
        renderShipsDock();
        updateSetupStatus();
        return;
      }
    }

    const currentTmpl = SHIP_TEMPLATES[state.selectedShipIndex];
    if (!currentTmpl) return;

    if (state.fleet.some(s => s.type === currentTmpl.type)) {
      audio.error();
      return;
    }

    const absCoords = getShipAbsoluteCoords(currentTmpl, state.currentRotation, r, c);
    if (!isValidPlacement(absCoords, state.fleet)) {
      audio.error();
      return;
    }

    // Colocar navio
    audio.place();
    state.fleet.push({
      id: `ship_${Date.now()}_${Math.random()}`,
      type: currentTmpl.type,
      name: currentTmpl.name,
      coords: absCoords.map(([cr, cc]) => `${cr},${cc}`)
    });

    clearGridPreviews();
    redrawSetupGrid();

    // Selecionar o próximo navio ainda não colocado
    const nextUnplacedIdx = SHIP_TEMPLATES.findIndex(t => !state.fleet.some(s => s.type === t.type));
    if (nextUnplacedIdx !== -1) {
      state.selectedShipIndex = nextUnplacedIdx;
    }

    renderShipsDock();
    updateSetupStatus();
  }

  // Posicionamento Aleatório Automático
  function autoPlaceFleet() {
    state.fleet = [];
    audio.place();

    for (const tmpl of SHIP_TEMPLATES) {
      let placed = false;
      let attempts = 0;

      while (!placed && attempts < 250) {
        attempts++;
        const rot = Math.floor(Math.random() * 4);
        const r = Math.floor(Math.random() * 10);
        const c = Math.floor(Math.random() * 10);

        const absCoords = getShipAbsoluteCoords(tmpl, rot, r, c);
        if (isValidPlacement(absCoords, state.fleet)) {
          state.fleet.push({
            id: `ship_${tmpl.type}`,
            type: tmpl.type,
            name: tmpl.name,
            coords: absCoords.map(([cr, cc]) => `${cr},${cc}`)
          });
          placed = true;
        }
      }
    }

    redrawSetupGrid();
    renderShipsDock();
    updateSetupStatus();
  }

  // ================= FASE DE BATALHA =================
  function initBattleScreen() {
    state.shotsToFire = [];
    state.shotsFiredHistory.clear();
    state.enemyShipsLeft = 8;
    state.myShipsLeft = 8;
    state.enemyShipsDamage = {};
    state.myShipsDamage = {};

    elements.enemyShipsLeft.textContent = '8';
    elements.myShipsLeft.textContent = '8';
    elements.battleLog.innerHTML = '<p>📡 Radares de combate ativados. Frota em posição!</p>';

    // Criar Grelha de Ataque
    createGridDOM(elements.attackGrid, handleAttackGridClick);

    // Criar Grelha de Defesa
    createGridDOM(elements.defenseGrid);
    renderDefenseGridShips();

    // Criar Gráfico/Lista com os barcos para serem riscados
    renderChecklists();

    updateSalvoIndicators();
    updateTurnUI();

    // No telemóvel, abre logo o ecrã correspondente à vez
    setMobileTab(state.isMyTurn ? 'attack' : 'defense');
  }

  // Renderiza a lista de navios e blocos para riscar quando afundarem
  function renderChecklists() {
    renderSingleChecklist(elements.enemyFleetChecklist, 'enemy');
    renderSingleChecklist(elements.myFleetChecklist, 'my');
  }

  function renderSingleChecklist(container, prefix) {
    container.innerHTML = '';
    SHIP_TEMPLATES.forEach(tmpl => {
      const item = document.createElement('div');
      item.className = 'checklist-ship-item';
      item.id = `${prefix}-chk-${tmpl.type}`;

      const header = document.createElement('div');
      header.className = 'checklist-ship-header';
      header.innerHTML = `<span>${tmpl.name}</span><span class="sunk-stamp">AO FUNDO</span>`;

      const blocksContainer = document.createElement('div');
      blocksContainer.className = 'checklist-blocks';
      for (let b = 0; b < tmpl.size; b++) {
        const blk = document.createElement('div');
        blk.className = 'chk-block';
        blk.dataset.blockIndex = b;
        blocksContainer.appendChild(blk);
      }

      item.appendChild(header);
      item.appendChild(blocksContainer);
      container.appendChild(item);
    });
  }

  // Marca um navio como afundado (AO FUNDO) com efeito de caneta vermelha riscado
  function markShipSunkInChecklist(shipType, isEnemy) {
    const prefix = isEnemy ? 'enemy' : 'my';
    const item = document.getElementById(`${prefix}-chk-${shipType}`);
    if (item) {
      item.classList.add('sunk');
      const allBlocks = item.querySelectorAll('.chk-block');
      allBlocks.forEach(b => b.classList.add('hit'));
    }
  }

  function registerDamageInChecklist(shipType, isEnemy) {
    const prefix = isEnemy ? 'enemy' : 'my';
    const store = isEnemy ? state.enemyShipsDamage : state.myShipsDamage;
    store[shipType] = (store[shipType] || 0) + 1;

    const item = document.getElementById(`${prefix}-chk-${shipType}`);
    if (item) {
      const blk = item.querySelector(`[data-block-index="${store[shipType] - 1}"]`);
      if (blk) blk.classList.add('hit');
    }
  }

  // Controle de Abas no Telemóvel (Apenas um ecrã de cada vez)
  function setMobileTab(tab) {
    state.activeMobileTab = tab;
    if (tab === 'attack') {
      elements.tabAttack.classList.add('active');
      elements.tabDefense.classList.remove('active');
      elements.arenaAttack.classList.add('mobile-active');
      elements.arenaDefense.classList.remove('mobile-active');
    } else {
      elements.tabDefense.classList.add('active');
      elements.tabAttack.classList.remove('active');
      elements.arenaDefense.classList.add('mobile-active');
      elements.arenaAttack.classList.remove('mobile-active');
    }
  }

  function renderDefenseGridShips() {
    for (const ship of state.fleet) {
      for (const coordStr of ship.coords) {
        const cell = elements.defenseGrid.querySelector(`[data-coord="${coordStr}"]`);
        if (cell) {
          cell.classList.add('ship-cell');
        }
      }
    }
  }

  function handleAttackGridClick(r, c, cell) {
    if (!state.isMyTurn) {
      audio.error();
      return;
    }

    const coordKey = `${r},${c}`;

    if (state.shotsFiredHistory.has(coordKey) || cell.classList.contains('hit') || cell.classList.contains('miss')) {
      audio.error();
      return;
    }

    const existingIndex = state.shotsToFire.findIndex(t => t.row === r && t.col === c);
    if (existingIndex !== -1) {
      audio.click();
      state.shotsToFire.splice(existingIndex, 1);
      cell.classList.remove('selected-target');
      cell.innerHTML = '';
      reindexTargetBadges();
      updateSalvoIndicators();
      return;
    }

    if (state.shotsToFire.length >= 3) {
      audio.error();
      return;
    }

    audio.target();
    state.shotsToFire.push({ row: r, col: c });
    cell.classList.add('selected-target');
    reindexTargetBadges();
    updateSalvoIndicators();
  }

  function reindexTargetBadges() {
    const allSelected = elements.attackGrid.querySelectorAll('.selected-target');
    allSelected.forEach(c => c.innerHTML = '');

    state.shotsToFire.forEach((target, idx) => {
      const cell = elements.attackGrid.querySelector(`[data-coord="${target.row},${target.col}"]`);
      if (cell) {
        cell.innerHTML = `<span class="target-num">T${idx + 1}</span>`;
      }
    });
  }

  function updateSalvoIndicators() {
    const count = state.shotsToFire.length;
    for (let i = 0; i < 3; i++) {
      if (i < count) {
        elements.slots[i].classList.add('armed');
      } else {
        elements.slots[i].classList.remove('armed');
      }
    }

    if (count === 3 && state.isMyTurn) {
      elements.btnFireSalvo.disabled = false;
    } else {
      elements.btnFireSalvo.disabled = true;
    }
  }

  function updateTurnUI() {
    if (state.isMyTurn) {
      elements.turnStatusText.textContent = '⚡ A TUA VEZ: Seleciona 3 coordenadas no Radar de Ataque!';
      elements.turnStatusText.className = 'turn-status-text your-turn';
      elements.battleWaitingAlert.classList.add('hidden');
      setMobileTab('attack'); // Em telemóvel abre automaticamente o ecrã de ataque!
    } else {
      elements.turnStatusText.textContent = '⏳ VEZ DO OPONENTE: A aguardar pelos 3 tiros do adversário...';
      elements.turnStatusText.className = 'turn-status-text enemy-turn';
      elements.battleWaitingAlert.classList.remove('hidden'); // Mensagem destacada a aguardar pelo adversário
      setMobileTab('defense'); // Em telemóvel abre automaticamente o ecrã de defesa para ver os tiros a cair!
    }
    updateSalvoIndicators();
  }

  function fireSalvo() {
    if (!state.isMyTurn || state.shotsToFire.length !== 3) return;

    elements.btnFireSalvo.disabled = true;
    audio.launch();

    state.shotsToFire.forEach(t => state.shotsFiredHistory.add(`${t.row},${t.col}`));
    socket.emit('fire_salvo', state.shotsToFire);
  }

  function logMessage(html) {
    const p = document.createElement('p');
    p.innerHTML = html;
    elements.battleLog.prepend(p);
  }

  // ================= EVENTOS DE SOCKET =================
  socket.on('room_created', (data) => {
    state.roomId = data.roomId;
    state.playerNumber = data.playerNumber;
    elements.displayRoomCode.textContent = data.roomId;
    showScreen('waiting');
  });

  socket.on('room_joined', (data) => {
    state.roomId = data.roomId;
    state.playerNumber = data.playerNumber;
    initSetupScreen();
    showScreen('setup');
  });

  socket.on('join_error', (msg) => {
    alert(msg);
  });

  socket.on('start_setup', () => {
    initSetupScreen();
    showScreen('setup');
  });

  socket.on('opponent_ready', () => {
    elements.setupStatusMsg.textContent = 'Oponente pronto! A aguardar a tua frota...';
  });

  socket.on('battle_start', (data) => {
    state.isMyTurn = data.yourTurn;
    initBattleScreen();
    showScreen('battle');
  });

  socket.on('turn_change', (data) => {
    state.isMyTurn = data.yourTurn;
    state.shotsToFire = [];
    updateTurnUI();
  });

  // Resultados dos 3 tiros
  socket.on('salvo_results', (data) => {
    const isShooter = data.shooter === state.playerNumber;

    // Em telemóvel: garante que o ecrã certo está visível para ver o resultado
    if (isShooter) {
      setMobileTab('attack');
    } else {
      setMobileTab('defense');
    }

    data.results.forEach((res, index) => {
      setTimeout(() => {
        const targetGrid = isShooter ? elements.attackGrid : elements.defenseGrid;
        const cell = targetGrid.querySelector(`[data-coord="${res.coord}"]`);

        if (cell) {
          cell.classList.remove('selected-target');
          cell.innerHTML = '';

          if (res.hit) {
            cell.classList.add('hit');
            audio.hit();

            // Nome do barco atingido
            const shipCleanName = res.shipName || 'Navio';

            if (isShooter) {
              registerDamageInChecklist(res.shipType, true);
              showCombatPopup('🎯', `TIRO NO ${shipCleanName.toUpperCase()}!`, 1800);
              logMessage(`<span class="log-hit">🎯 TIRO CERTEIRO!</span> Tiro em ${coordToHuman(res.coord)}: <strong>Tiro no ${shipCleanName}!</strong>`);
            } else {
              registerDamageInChecklist(res.shipType, false);
              showCombatPopup('⚠️', `O TEU ${shipCleanName.toUpperCase()} FOI ATINGIDO!`, 1800);
              logMessage(`<span class="log-hit">⚠️ DANO RECEBIDO!</span> Em ${coordToHuman(res.coord)}: <strong>O teu ${shipCleanName} foi atingido!</strong>`);
            }
          } else {
            cell.classList.add('miss');
            audio.water();

            if (isShooter) {
              logMessage(`<span class="log-miss">🌊 ÁGUA:</span> Tiro em ${coordToHuman(res.coord)} atingiu o mar.`);
            } else {
              logMessage(`<span class="log-miss">🛡️ DEFESA:</span> O tiro inimigo em ${coordToHuman(res.coord)} foi na água.`);
            }
          }
        }
      }, index * 450); // Efeito sequencial dos 3 tiros caindo
    });

    // Se houve navio afundado
    if (data.sunkShips && data.sunkShips.length > 0) {
      setTimeout(() => {
        audio.sunk();
        data.sunkShips.forEach(s => {
          const shipCleanName = s.name || 'Navio';

          if (isShooter) {
            state.enemyShipsLeft = Math.max(0, state.enemyShipsLeft - 1);
            elements.enemyShipsLeft.textContent = state.enemyShipsLeft;
            
            // Riscar no gráfico de navios
            markShipSunkInChecklist(s.type, true);

            // Pop-up e Mensagem exata pedida: "Porta-Aviões ao fundo!"
            showCombatPopup('💥', `${shipCleanName.toUpperCase()} AO FUNDO!`, 2800);
            logMessage(`<span class="log-sunk">💥 AFUNDADO!</span> <strong>${shipCleanName} ao fundo!</strong>`);
          } else {
            state.myShipsLeft = Math.max(0, state.myShipsLeft - 1);
            elements.myShipsLeft.textContent = state.myShipsLeft;

            // Riscar no gráfico de navios
            markShipSunkInChecklist(s.type, false);

            showCombatPopup('🚨', `O TEU ${shipCleanName.toUpperCase()} FOI AO FUNDO!`, 2800);
            logMessage(`<span class="log-sunk">🚨 PERDA:</span> <strong>O teu ${shipCleanName} foi ao fundo!</strong>`);
          }

          // Destacar as células do navio afundado
          const targetGrid = isShooter ? elements.attackGrid : elements.defenseGrid;
          s.coords.forEach(coordKey => {
            const c = targetGrid.querySelector(`[data-coord="${coordKey}"]`);
            if (c) c.classList.add('sunk');
          });
        });

        // Preenchimento automático de água ao redor do navio afundado
        if (data.surroundings) {
          const targetGrid = isShooter ? elements.attackGrid : elements.defenseGrid;
          data.surroundings.forEach(coordKey => {
            const cell = targetGrid.querySelector(`[data-coord="${coordKey}"]`);
            if (cell && !cell.classList.contains('hit') && !cell.classList.contains('sunk')) {
              cell.classList.add('miss');
            }
          });
        }
      }, 1500);
    }
  });

  function coordToHuman(coordKey) {
    const [r, c] = coordKey.split(',').map(Number);
    return `${COLS[c]}${r + 1}`;
  }

  // Fim de Jogo
  socket.on('game_over', (data) => {
    setTimeout(() => {
      const won = data.winner === state.playerNumber;
      if (won) {
        audio.victory();
        elements.gameoverIcon.textContent = '🏆';
        elements.gameoverTitle.textContent = 'VITÓRIA NAVAL!';
        elements.gameoverTitle.style.color = 'var(--neon-green)';
        elements.gameoverDesc.textContent = 'Parabéns, Comandante! Aniquilaste toda a frota inimiga!';
      } else {
        audio.defeat();
        elements.gameoverIcon.textContent = '☠️';
        elements.gameoverTitle.textContent = 'FROTA DESTRUÍDA!';
        elements.gameoverTitle.style.color = 'var(--neon-red)';
        elements.gameoverDesc.textContent = 'Todos os teus navios foram afundados pelo adversário.';
      }
      elements.modalGameOver.classList.remove('hidden');
    }, 2000);
  });

  socket.on('rematch_offered', () => {
    elements.rematchStatus.textContent = 'O adversário pediu uma revanche! Clica em Jogar Novamente para aceitar.';
  });

  socket.on('player_disconnected', () => {
    alert('O oponente desconectou-se da partida.');
    window.location.href = '/';
  });

  // ================= EVENT LISTENERS DE INTERFACE =================
  elements.btnCreateGame.addEventListener('click', () => {
    audio.click();
    socket.emit('create_room');
  });

  elements.btnJoinGame.addEventListener('click', () => {
    const code = elements.roomInput.value.trim().toUpperCase();
    if (!code) {
      audio.error();
      return;
    }
    audio.click();
    socket.emit('join_room', code);
  });

  elements.roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') elements.btnJoinGame.click();
  });

  // Partilha WhatsApp
  elements.btnShareWhatsapp.addEventListener('click', () => {
    audio.click();
    const shareUrl = `${window.location.origin}/?sala=${state.roomId}`;
    const text = encodeURIComponent(`⚓ Desafio-te para uma Batalha Naval Arcade! Entra na minha sala de combate aqui:\n${shareUrl}`);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${text}`;
    window.open(whatsappUrl, '_blank');
  });

  // Copiar Link
  elements.btnCopyLink.addEventListener('click', () => {
    audio.click();
    const shareUrl = `${window.location.origin}/?sala=${state.roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      elements.copyFeedback.classList.remove('hidden');
      setTimeout(() => elements.copyFeedback.classList.add('hidden'), 3000);
    }).catch(() => {
      prompt('Copia o link abaixo:', shareUrl);
    });
  });

  // Rodar Navio (botão)
  elements.btnRotateShip.addEventListener('click', () => {
    rotateCurrentShip();
  });

  // Aleatório
  elements.btnAutoPlace.addEventListener('click', () => {
    autoPlaceFleet();
  });

  // Limpar
  elements.btnClearFleet.addEventListener('click', () => {
    audio.click();
    state.fleet = [];
    redrawSetupGrid();
    renderShipsDock();
    updateSetupStatus();
  });

  // Confirmar Frota
  elements.btnConfirmFleet.addEventListener('click', () => {
    if (state.fleet.length !== 8) return;
    audio.click();
    elements.btnConfirmFleet.disabled = true;
    elements.setupStatusMsg.textContent = 'Frota confirmada! A aguardar pelo adversário...';
    elements.setupWaitingOpponent.classList.remove('hidden');
    socket.emit('confirm_fleet', state.fleet);
  });

  // Disparar Salva
  elements.btnFireSalvo.addEventListener('click', () => {
    fireSalvo();
  });

  // Revanche
  elements.btnRematch.addEventListener('click', () => {
    audio.click();
    elements.rematchStatus.textContent = 'Pedido de revanche enviado ao oponente...';
    elements.btnRematch.disabled = true;
    socket.emit('request_rematch');
  });

  elements.btnReturnLobby.addEventListener('click', () => {
    audio.click();
    window.location.href = '/';
  });

  // Mute Som
  elements.btnSoundToggle.addEventListener('click', () => {
    const isMuted = audio.toggleMute();
    elements.btnSoundToggle.textContent = isMuted ? '🔇' : '🔊';
  });

  // Mobile Tabs
  elements.tabAttack.addEventListener('click', () => setMobileTab('attack'));
  elements.tabDefense.addEventListener('click', () => setMobileTab('defense'));

  // Autojoin via URL query param (?sala=XYZ)
  const urlParams = new URLSearchParams(window.location.search);
  const paramRoom = urlParams.get('sala') || urlParams.get('room');
  if (paramRoom) {
    elements.roomInput.value = paramRoom.trim().toUpperCase();
    setTimeout(() => {
      elements.btnJoinGame.click();
    }, 400);
  }

})();
