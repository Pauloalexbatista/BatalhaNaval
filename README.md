# ⚓ Batalha Naval Arcade (Navy Strike)

Jogo multiplayer online de Batalha Naval para **2 jogadores**, desenhado para o **ArcadeHub**, com convite direto via WhatsApp, salva de 3 tiros simultâneos e visual Retro Arcade Neon.

---

## 🎮 Características & Regras

1. **Multiplayer 2 Jogadores sem Registos:**
   - O Jogador 1 clica em **"Criar Novo Jogo"** e obtém um botão direto **"Convidar no WhatsApp"** (ou copia o link direto).
   - O Jogador 2 clica no link recebido no WhatsApp e entra imediatamente na sala!

2. **No Telemóvel (Mobile-First):**
   - **Um ecrã de cada vez:** O telemóvel mostra com total clareza e botões grandes apenas a grelha relevante no momento.
   - Alternância automática inteligente:
     - Na tua vez de atacar -> Abre automaticamente o **Radar de Ataque** para disparar os 3 tiros.
     - Na vez do adversário -> Abre a **Grelha de Defesa** para ver os tiros dele a caírem sobre a tua frota.
     - O jogador pode também alternar livremente entre as abas a qualquer instante.

3. **Rodar os Navios Antes de Fixar:**
   - 🔄 **Botão Direito do Rato:** Clica com o botão direito diretamente na grelha para rodar o barco onde o cursor estiver apontado!
   - ⌨️ **Teclado:** Prime a tecla `R` ou a `Barra de Espaço` para rodar.
   - 🖱️ **Roda do Rato (Scroll):** Rola para girar a orientação.
   - 📱 **Mobile:** Botão de rotação na barra superior para alternar facilmente.

4. **Aviso Claro de Espera:**
   - Enquanto o adversário está a pensar ou a escolher os seus 3 alvos, aparece um banner destacado com sonar animado: **"⏳ A AGUARDAR PELO ADVERSÁRIO..."**.

5. **Mensagens Detalhadas de Combate:**
   - **Ao atingir:** `"🎯 Tiro no Porta-Aviões!"`, `"🎯 Tiro no Couraçado!"`, etc.
   - **Ao afundar:** `"💥 Porta-Aviões ao fundo!"`, `"💥 Couraçado ao fundo!"`, etc.
   - Pop-up arcade visual no ecrã com alarme sonoro e registo no log de combate.

6. **Gráfico dos Navios Riscados (Estilo Clássico):**
   - Painel abaixo das grelhas com o desenho de cada um dos 8 navios em blocos.
   - Quando um navio é destruído, é **riscado a vermelho** (efeito de caneta de batalha naval tradicional) e recebe o carimbo **"AO FUNDO"**!

7. **A Frota Clássica (8 Navios, 20 Quadrados no total):**
   - 1x **Porta-Aviões em "T"** (5 quadrados: barra superior de 3 + haste vertical de 2).
   - 1x **Couraçado** (4 quadrados retos).
   - 2x **Contratorpedeiros** (3 quadrados retos cada).
   - 1x **Torpedeiro** (2 quadrados retos).
   - 3x **Submarinos** (1 quadrado cada).

8. **Regra de Adjacência (Sem Colar Navios):**
   - Não é permitido colocar navios colados a outros (nem pelas diagonais).
   - Quando um navio vai ao fundo, todos os quadrados em redor dele são automaticamente preenchidos como **Água (🌊)**.

---

## 🚀 Como Iniciar

### Windows:
Duplo clique em `iniciar_jogo.bat`. Abre logo no browser em `http://localhost:3000`.

### Terminal:
```bash
npm start
```

---

## 🌐 Instalação no VPS (`naval.testeweb.site` - IP: 187.124.32.121)

### 1. Clonar no VPS
```bash
cd /var/www
git clone https://github.com/Pauloalexbatista/BatalhaNaval.git naval
cd naval
npm install --production
```

### 2. Iniciar com PM2 (Porta 3005)
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### 3. Configurar Nginx para `naval.testeweb.site`
Crie ou adicione em `/etc/nginx/sites-available/naval`:
```nginx
server {
    listen 80;
    server_name naval.testeweb.site;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative o site e reinicie o Nginx:
```bash
ln -s /etc/nginx/sites-available/naval /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 4. Ativar SSL / HTTPS com Certbot
```bash
certbot --nginx -d naval.testeweb.site
```
