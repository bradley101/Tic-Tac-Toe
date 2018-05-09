const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);

app.set('view engine', 'ejs');
app.engine('ejs', require('ejs').renderFile);

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});

app.get('/chat/:room', (req, res) => {
	res.render('chat_index', {room: req.params.room});
});

let sessions = {
};

app.get('/chat/:name/:room', (req, res) => {
	res.render('chat', {name: req.params.name, room: req.params.room});
});

app.get('/play/:room', (req, res) => {
	res.render('play_index', {room: req.params.room})
})

app.get('/play/:name/:room', (req, res) => {
	res.render('game', {name: req.params.name, room: req.params.room});
});


let user = class {
	constructor(s) {
		this.socket = s;
		var tthis = this;
		s.on('init', function (data) {
			console.log(data);
			var j = JSON.parse(data);
			var room = j.room;
			tthis.room = room;
			s.on(room, function (ddata) {
				console.log(ddata);
				s.broadcast.emit(room, ddata);
			});
		});
	}
};

let game_user = class {
	constructor(s) {
		this.s = s;
		this.gameStart.bind(this);
		var tthis = this;
		s.on('init', function (data) {
			console.log('Init data from client - ' + data);
			var j = JSON.parse(data);
			const room = j.room, name = j.name;
			tthis.room = room;
			
			if (!sessions[room]) {
				sessions[room] = {
					count: 1,
					users: [
						{
							id: s.id,
							name: name,
							score: 0
						}
					]
				}
				
			} else if (sessions[room].count == 1) {
				sessions[room].count = 2
				sessions[room].users.push({
					id: s.id,
					name: name,
					score: 0
				})

				var msg = {};
				Object.assign(msg, { start: true }, sessions[room].users);
				msg = JSON.stringify(msg);
				var start_event = `${room}_start`;
				tthis.sendToId(sessions[room].users, start_event, JSON.stringify({start: true}));
				tthis.sendToId(sessions[room].users, 
					`${room}_refresh_score`, 
					JSON.stringify(sessions[room].users
				));

				tthis.gameStart();
			} else {
				s.disconnect(false);
				console.log('server disconnect event');
			}

			s.on('disconnect', (reason) => {
				console.log('client disconnected event');
				sessions[room].count -= 1
				for (var i = 0; i < sessions[room].users.length; ++i) {
					if (sessions[room].users[i].id == s.id) {
						sessions[room].users.splice(i, 1);
						break;
					}
				}
			})
		});
	}

	sendToId(ids, e, m) {
		ids.forEach(id => {
			io.to(id.id).emit(e, m);
		});
	}

	gameStart() {
		let turn = 0;
		let s = this.s;

	}
};

let GameEnv = class {
	constructor(user1, user2) {
		this.env = {
			users: [user1, user2],
			score: [
				{
					wins: 0,
					losses: 0
				},
				{
					wins: 0,
					losses: 0
				}
			]
		}

		var that = this;

		this.GameRound = class {
			constructor(turn = undefined) {
				this.moves = 0
				this.situation = [
					['', '', ''], 
					['', '', ''], 
					['', '', '']
				];
				this.turn = turn == undefined ? Math.round(Math.random()) : turn == 0 ? 1 : 0;
				this.symbols = {}
				this.symbols[this.turn] = 'x'
				this.symbols[this.turn == 0 ? 1 : 0] = 'o'
				this.roundId = Math.random().toString(36).substring(7);

				this.sendScore.bind(this);
				this.start.bind(this);
				this.move.bind(this);
				this.moveCompletedCallback.bind(this);
				this.analyzeSituation.bind(this);
				this.declareWinner.bind(this);

				this.sendScore('init_scores');
				this.start();
			}
			sendScore(event) {
				let score = {}
				score['id'] = this.roundId;
				score[that.env.users[0].socket.id] = [that.env.users[0].name, that.env.score[0]];
				score[that.env.users[1].socket.id] = [that.env.users[1].name, that.env.score[1]];
				score = JSON.stringify(score);
				that.env.users[0].socket.emit(event, score);
				that.env.users[1].socket.emit(event, score);
			}
			start() {
				that.env.users[0].socket.on('move_completed', this.moveCompletedCallback.bind(this));
				that.env.users[1].socket.on('move_completed', this.moveCompletedCallback.bind(this));
			}
			move() {
				that.env.users[this.turn].socket.emit('move', 
					JSON.stringify({"turn":`${this.turn}`,
									"move":`${this.moves}`, 
									"round_id": `${this.roundId}`,
									"symbol": `${this.symbols[this.turn]}`
					})
				);
			}
			moveCompletedCallback(data) {
				let j = JSON.parse(data);
				this.situation[parseInt(j["move-x"])][parseInt(j["move-y"])] = this.symbols[this.turn];
				this.turn = 1 - parseInt(j.turn);
				this.moves = parseInt(j.moves) + 1;
				console.log(this.situation)

				that.env.users[this.turn].socket.emit('showOppMove', data);

				this.analyzeSituation();

				this.move();
			}
			analyzeSituation() {
				let t = this.situation;
				if (t[0][0] == t[0][1] && t[0][1] == t[0][2] && t[0][0] != '')
					this.declareWinner(t[0][0]);
				else if (t[1][0] == t[1][1] && t[1][1] == t[1][2] && t[1][0] != '')
					this.declareWinner(t[1][0])
				else if (t[2][0] == t[2][1] && t[2][1] == t[2][2] && t[2][0] != '')
					this.declareWinner(t[2][0])
				else if (t[0][0] == t[1][0] && t[1][0] == t[2][0] && t[0][0] != '')
					this.declareWinner(t[0][0])
				else if (t[0][1] == t[1][1] && t[1][1] == t[2][1] && t[0][1] != '')
					this.declareWinner(t[0][1])
				else if (t[0][2] == t[1][2] && t[1][2] == t[2][2] && t[0][2] != '')
					this.declareWinner(t[0][2])
				else if (t[0][0] == t[1][1] && t[1][1] == t[2][2] && t[0][0] != '')
					this.declareWinner(t[0][0])
				else if (t[0][2] == t[1][1] && t[1][1] == t[2][0] && t[0][2] != '')
					this.declareWinner(t[0][2])
			}
			declareWinner(m) {
				let winnerTurn = this.turn == 0 ? 1 : 0;
				let msg = JSON.stringify({"winner": `${that.env.users[winnerTurn].socket.id}`});
				that.env.users[0].socket.emit('gameOver', msg)
				that.env.users[1].socket.emit('gameOver', msg);
				that.env.score[winnerTurn].wins += 1
				that.env.score[this.turn].losses += 1
			}
		}

		let round = new this.GameRound();
		round.move();
	}

	gameStart(round) {
		console.log(round.turn);

	}
}

io.on('connection', (socket) => {
	// uncomment this for chat feature
	// var u = new user(socket);
	socket.on('init', (data) => {
		var j = JSON.parse(data);
		if (sessions[j.room] && sessions[j.room].users.length < 2) {
			socket.emit('init_id', socket.id);
			sessions[j.room].users.push(
				{
					socket: socket,
					name: j.name
				}
			)
			sessions[j.room].game_environment = new GameEnv(
				sessions[j.room].users[0],
				sessions[j.room].users[1]
			);

		} else if (!sessions[j.room]) {
			socket.emit('init_id', socket.id);
			sessions[j.room] = {
				users: [
					{
						socket: socket,
						name: j.name
					}
				]
			}
		}
	})
	// var u = new game_user(socket);
});

server.listen(process.env.PORT || 3000);