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

app.get('/chat/:name/:room', (req, res) => {
	res.render('chat', {name: req.params.name, room: req.params.room});
});

app.get('/game', (req, res) => {
	res.render('game');
})


let user = class {
	constructor(s) {
		this.socket = s;
		var tthis = this;
		s.on('init', function (data) {
			console.log(data);
			var j = JSON.parse(data);
			tthis.room = j.room;

			s.on(tthis.room, function (ddata) {
				console.log(ddata);
				s.broadcast.emit(tthis.room, ddata);
			});
		});
	}
};


io.on('connection', (socket) => {
	console.log('user connected');
	var u = new user(socket);
});

server.listen(process.env.PORT || 3000);