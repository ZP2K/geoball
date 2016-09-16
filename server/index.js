var WebSocketServer = require("ws").Server;
var express = require("express");
var app = express();
var http = require("http").Server(app);
http.listen(process.env.PORT || 3000);
app.use(express.static(__dirname + "/public"));
var ws = new WebSocketServer({server: http});

var clients = [];
var rooms = [];
// resolution for each player a.k.a viewports
var viewport = {
	w: 1920,
	h: 1080
};

ws.on("connection", function(c) {
	c.binaryType = "arraybuffer";
	// add the client on connection
	addClient(c);
	
	c.on("message", function(e) {
		var d = new Uint8Array(e);
		var room = rooms[c.room];
		var player = room.players[c.playerIndex];
		
		// mouse move
		if (d[0] === 0) {
			var d1 = bytesToInt2([d[2], d[3]]);
			var d2 = bytesToInt2([d[4], d[5]]);
			
			player.angle = Math.atan2(d2, d1);
		// key down
		} else if (d[0] === 1) {
			player.keys[d[1]] = true;
			
			if (d[1] === 87) {
				player.dy = -1;
			// a
			} else if (d[1] === 65) {
				player.dx = -1;
			// s
			} else if (d[1] === 83) {
				player.dy = 1;
			// d
			} else if (d[1] === 68){
				player.dx = 1;
			}
		// key up
		} else if (d[0] === 2) {
			player.keys[d[1]] = false;
			
			// w or s
			if (d[1] === 87 || d[1] === 83) {
				player.dy = 0;
				
				if (player.keys[87] === true) {
					player.dy = -1;
				} else if (player.keys[83] === true) {
					player.dy = 1;
				}
			// a or d
			} else if (d[1] === 65 || d[1] === 68) {
				player.dx = 0;
				
				if (player.keys[65] === true) {
					player.dx = -1;
				} else if (player.keys[68] === true) {
					player.dx = 1;
				}
			}	
		// mouse down
		} else if (d[0] === 3) {
			if (d[1] === 1) {
				player.actions.leftmousedown = true;
				player.actions.rightmousedown = false;
			} else if (d[1] === 3) {
				player.actions.rightmousedown = true;
				player.actions.leftmousedown = false;
			}
		// mouse up
		} else if (d[0] === 4) {
			if (d[1] === 1 && player.actions.leftmousedown === true) {
				player.actions.leftmousedown = false;
				if (player.balls > 0) {
					player.balls--;
					
					room.balls.push({
						x: player.tArm.x,
						y: player.tArm.y,
						zr: room.ballRadius + 10,
						vx: Math.cos(player.angle) * player.power,
						vy: Math.sin(player.angle) * player.power,
						vr: 0,
						r: room.ballRadius,
						team: player.team,
						bounced: false
					});

					player.power = 0;
				}
				
				var data = new Uint8Array([1, player.balls]);
				
				try {
					player.client.send(data, {binary: true});
				} catch(e) {
					removeClient(player.client);
				}
			} else if (d[1] === 3 && player.actions.rightmousedown === true) {
				player.actions.rightmousedown = false;
			}
		}
	});

	// when connection closes, remove the client
	c.on("close", function() {
		removeClient(c);
	});
});

// all updating
(function update() {
	for (var i = 0; i < rooms.length; i++) {
		var room = rooms[i];
		
		updateBalls(room);
		updatePlayers(room);
		sendDataTo(room);
	}
	
	// recall update in 17ms (60fps)
	setTimeout(update, 1000/60);
})();

function bytesToInt2(a) {
	if (a[1] > 127) {
		return -(((a[1] << 8 | a[0]) ^ 0xFFFF) + 1)
	} else {
		return a[1] << 8 | a[0];
	}
}

function updateBalls(room) {
	var remove = [];
	
	for (var i = 0; i < room.balls.length; i++) {
		var ball = room.balls[i];
		var gravity = room.gravity;
		var friction = room.friction;
		
		ball.vr += gravity;
		ball.vx *= friction;
		ball.vy *= friction;
		
		ball.zr -= ball.vr;
		ball.x += ball.vx;
		ball.y += ball.vy;
		
		if (ball.x + ball.r >= room.width) {
			ball.vx *= -1;
			ball.x = room.width - ball.r;
		} else if (ball.x - ball.r <= 0) {
			ball.vx *= -1;
			ball.x = ball.r;
		}
		
		if (ball.y + ball.r >= room.height) {
			ball.vy *= -1;
			ball.y = room.height - ball.r;
		} else if (ball.y - ball.r <= 0) {
			ball.vy *= -1;
			ball.y = ball.r;
		}
		
		if (ball.zr <= ball.r) {
			ball.bounced = true;
			ball.zr = ball.r;
			ball.vr = -ball.vr * 0.6;
		}
		
		for (var a = 0; a < room.players.length; a++) {
			var player = room.players[a];
			var tArm = checkCollision(ball, {x: player.tArm.x, y: player.tArm.y, r: room.players[a].r / 3});
			var arm = checkCollision(ball, {x: player.arm.x, y: player.arm.y, r: player.r / 3});
			if (player.actions.rightmousedown === true && (tArm === true || arm === true) && (ball.bounced === true || ball.team !== player.team)) {
				if (player.balls < player.maxBalls) {
					remove.push(i);
					player.balls++;
					
					var data = new Uint8Array([1, player.balls]);
					
					try {
						player.client.send(data, {binary: true});
					} catch(e) {
						removeClient(player.client);
					}
				} else if (ball.bounced === false) {
					var velX1 = (player.vx * (player.r - ball.r) + (ball.r * ball.vx)) / (player.r + ball.r);
					var velY1 = (player.vy * (player.r - ball.r) + (ball.r * ball.vy)) / (player.r + ball.r);
					var velX2 = (ball.vx * (ball.r - player.r) + (player.r * player.vx)) / (player.r + ball.r);
					var velY2 = (ball.vy * (ball.r - player.r) + (player.r * player.vy)) / (player.r + ball.r);

					player.vx = velX1;
					player.vy = velY1;
					ball.vx = velX2;
					ball.vy = velY2;
				
					player.x += velX1;
					player.y += velY1;
					ball.x += velX2;
					ball.y += velY2;
				}
			} else if (ball.bounced === false && ball.team !== player.team && checkCollision(player, ball) === true) {
				var velX1 = (player.vx * (player.r - ball.r) + (ball.r * ball.vx)) / (player.r + ball.r);
				var velY1 = (player.vy * (player.r - ball.r) + (ball.r * ball.vy)) / (player.r + ball.r);
				var velX2 = (ball.vx * (ball.r - player.r) + (player.r * player.vx)) / (player.r + ball.r);
				var velY2 = (ball.vy * (ball.r - player.r) + (player.r * player.vy)) / (player.r + ball.r);

				player.vx = velX1;
				player.vy = velY1;
				ball.vx = velX2;
				ball.vy = velY2;
				
				player.x += velX1;
				player.y += velY1;
				ball.x += velX2;
				ball.y += velY2;
			}
		}
	}
	
	for (var i = 0; i < remove.length; i++) {
		room.balls.splice(remove[i], 1);
	}
}

function checkCollision(c, c1) {
	var dx = c.x - c1.x;
	var dy = c.y - c1.y;
	
	return Math.sqrt(dx * dx + dy * dy) <= c.r + c1.r;
}

function updatePlayers(room) {
	for (var i = 0; i < room.players.length; i++) {
		var player = room.players[i];
		
		// movement
		player.vx += player.acceleration * player.dx;
		player.vy += player.acceleration * player.dy;
		
		var speed = player.actions.rightmousedown === true || (player.actions.leftmousedown === true && player.balls > 0) ? player.speed / 2 : player.speed;
		
		if (player.vx >= speed) {
			player.vx = speed;
		} else if (player.vx <= -speed) {
			player.vx = -speed;
		}
		
		if (player.vy >= speed) {
			player.vy = speed;
		} else if (player.vy <= -speed) {
			player.vy = -speed;
		}
		
		player.x += player.vx;
		player.y += player.vy;
		
		player.vx *= 0.95;
		player.vy *= 0.95;
		
		if (player.team === true) {
			if (player.x <= 0) {
				player.x = 0;
			} else if (player.x >= room.width / 2) {
				player.x = room.width / 2;
			}
		} else {
			if (player.x >= room.width) {
				player.x = room.width;
			} else if (player.x <= room.width / 2) {
				player.x = room.width / 2;
			}
		}
		
		if (player.y >= room.height) {
			player.y = room.height;
		} else if (player.y <= 0) {
			player.y = 0;
		}
		
		// throwing balls
		if (player.actions.leftmousedown === true) {
			player.power += ((player.maxPower - player.power) / player.powerSpeed);
		} else if (player.power > 0) {
			player.power--;
		}
		
		if (player.power >= player.maxPower) {
			player.power = player.maxPower;
		}
		
		// arm movement
		
		if (player.balls > 0 && player.actions.leftmousedown === true) {
			player.tArm.x = (player.x + Math.cos((180 * Math.PI / 180) + player.angle) * (player.r + ((player.power / player.maxPower) * player.r))) - player.vx;
			player.tArm.y = (player.y + Math.sin((180 * Math.PI / 180) + player.angle) * (player.r + ((player.power / player.maxPower) * player.r))) - player.vy;
			
			player.arm.x = (player.x + Math.cos(player.angle) * (player.r + (player.power / player.maxPower) * player.r * 0.5)) - player.vx;
			player.arm.y = (player.y + Math.sin(player.angle) * (player.r + (player.power / player.maxPower) * player.r * 0.5)) - player.vy;
		} else if (player.actions.rightmousedown === true) {
			player.tArm.x = player.x + Math.cos(player.angle - (player.r / 3 * Math.PI / 180)) * player.r;
			player.tArm.y = player.y + Math.sin(player.angle - (player.r / 3 * Math.PI / 180)) * player.r;
			
			player.arm.x = player.x + Math.cos(player.angle + (player.r / 3 * Math.PI / 180)) * player.r;
			player.arm.y = player.y + Math.sin(player.angle + (player.r / 3 * Math.PI / 180)) * player.r;
		} else {
			player.tArm.x = (player.x - player.r) - player.vx;
			player.arm.x = (player.x + player.r) - player.vx;
			player.tArm.y = player.y - player.vy;
			player.arm.y = player.y - player.vy;
		}
	}
}

function sendDataTo(room) {
	for (var i = 0; i < room.players.length; i++) {
		var player = room.players[i];
		
		var offsetX = -player.x + (viewport.w / 2);
		var offsetY = -player.y + (viewport.h / 2);
		var minX = player.x - (viewport.w / 2)
		var maxX = player.x + (viewport.w / 2);
		var minY = player.y - (viewport.h / 2);
		var maxY = player.y + (viewport.h / 2);
		
		var balls = [];
		for (var a = 0, len = room.balls.length; a < len; a++) {
			var ball = room.balls[a];
			
			if (ball.x + ball.zr >= minX && ball.x - ball.zr <= maxX && ball.y + ball.zr >= minY && ball.y - ball.zr <= maxY) {
				balls.push(cut(ball.x + offsetX) * 10, cut(ball.y + offsetY) * 10, cut(ball.zr) * 10);
			}
		}
		
		var data = new Int16Array(balls.length + 1);
		data[0] = 3;
		
		for (var a = 0, len = balls.length; a < len; a++) {
			data[a + 1] = balls[a];
		}
		
		try {
			player.client.send(data.buffer, {binary: true});
		} catch(e) {
			removeClient(player.client);
			continue;
		}
		
		var players = [];
		for (var a = 0, len = room.players.length; a < len; a++) {
			var p = room.players[a];
			
			if ((p.x + p.r >= minX && p.x - p.r <= maxX && p.y + p.r >= minY && p.y - p.r <= maxY) &&
				(p.tArm.x + p.r / 2 >= minX && p.tArm.x - p.r / 2 <= maxX && p.tArm.y + p.r / 2 >= minY && p.tArm.y - p.r / 2 <= maxY) &&
				(p.arm.x + p.r / 2 >= minX && p.arm.x - p.r / 2 <= maxX && p.arm.y + p.r / 2 >= minY && p.arm.y - p.r / 2 <= maxY))
			{
				players.push(cut(p.x + offsetX) * 10, cut(p.y + offsetY) * 10, cut(p.tArm.x + offsetX) * 10, cut(p.tArm.y + offsetY) * 10, cut(p.arm.x + offsetX) * 10, cut(p.arm.y + offsetY) * 10, cut(p.balls));
			}
		}
		
		data = new Int16Array(players.length + 1);
		data[0] = 4;
		
		for (var a = 0, len = players.length; a < len; a++) {
			data[a + 1] = players[a];
		}
		
		try {
			player.client.send((new Int16Array([2, (-player.x + room.width / 2) * 10, (-player.y + room.height / 2) * 10])).buffer);
			player.client.send(data.buffer, {binary: true});
		} catch(e) {
			removeClient(player.client);
			continue;
		}
	}
}

function cut(n) {
	return Math.round(n * 10) / 10;
}

// adding a client
function addClient(client) {
	client.index = clients.length;
	clients.push(client);
	
	var room;
	
	for (var i = 0, maxed = true; i < rooms.length; i++) {
		if (rooms[i].players.length < rooms[i].maxPlayers) {
			room = i;
			maxed = false;
			break;
		}
	}
	
	if (maxed === true) {
		addRoom();
		room = rooms.length - 1;
	}
	
	client.room = room;
	client.playerIndex = rooms[room].players.length;
	
	// true = left side, false = right side
	// determines which side to be on
	for (var i = 0, t = 0, f = 0, room = rooms[room]; i < room.players.length; i++) {
		if (room.players[i].team === true) {
			t++;
		} else {
			f++;
		}
	}
	
	var team = f > t ? true : false;
	// if even amount of players, pick random
	team = f === t ? (Math.random() > 0.5 ? true : false) : team;
	
	var x = team === true ? room.width / 6 : room.width - room.width / 6;
		
	// player defaults
	room.players.push({
		x: x,
		y: room.height / 2,
		acceleration: 0.35,
		deceleration: 0.95,
		speed: 5,
		// direction x
		dx: 0,
		// direction y
		dy: 0,
		vx: 0,
		vy: 0,
		keys: [],
		client: client,
		team: team,
		power: 0,
		maxPower: 45,
		// time it takes to pullback
		powerSpeed: 35,
		actions: {
			leftmousedown: false,
			rightmousedown: false,
		},
		balls: 0,
		maxBalls: 2,
		r: 35,
		tArm: {
			x: x,
			y: room.height / 2 - (0.5 * 50)
		},
		arm: {
			x: x,
			y: room.height / 2 - (0.5 * 50)
		},
		angle: 0
	});
	
	try {
		var data = new Uint8Array([0, room.width / 100, room.height / 100, room.ballRadius]);
		client.send(data.buffer, {binary: true});
		
		data = new Uint8Array([1, room.players[room.players.length - 1].balls]);
		client.send(data.buffer, {binary: true});
	} catch (e) {
		removeClient(client);
	}

	return client.index;
}

// removing a client
function removeClient(client) {
	for (var i = client.index + 1; i < clients.length; i++) {
		clients[i].index--;
	}
	
	clients.splice(client.index, 1);
	
	if (client.room != undefined && rooms[client.room] != undefined) {
		var room = rooms[client.room];
		for (var i = client.playerIndex + 1; i < room.players.length; i++) {
			room.players[i].client.playerIndex--;
		}
		
		room.players.splice(client.playerIndex, 1);
	}

	if (rooms.length > 0) {
		for (var i = 0; i < rooms.length; i++) {
			if (rooms[i].players.length === 0) {
				rooms.splice(i, 1);
				// loop over all rooms above empty
				for (var a = i; a < rooms.length; a++) {
					// and redo their client room
					for (var e = 0; e < rooms[a].players.length; e++) {
						rooms[a].players[e].client.room = a;
					}
				}
			}
		}
	}
	
	client.close();
}

// adding a room
function addRoom() {
	// room settings
	var room = {
		width: 2000,
		height: 1000,
		maxPlayers: 12,
		balls: [],
		maxBalls: 25,
		ballRadius: 20,
		players: [],
		gravity: 0.02,
		friction: 0.98
	};
	
	var spacing = (room.height - (room.maxBalls * room.ballRadius * 2)) / (room.maxBalls + 1);
	
	// add balls in middle
	for (var i = spacing + room.ballRadius; i < room.height; i += spacing + (2 * room.ballRadius)) {
		room.balls.push({
			x: room.width / 2,
			y: i,
			// essentially z, gives effect that it is bouncing
			zr: room.ballRadius + 15,
			vx: 0,
			vy: 0,
			vr: 0,
			// min radius
			r: room.ballRadius,
			bounced: true,
			team: undefined
		});
	}
	
	rooms.push(room);
	
	// return the room
	return rooms[rooms.length - 1];
}

// to str conversion for data sending
function toStr(a) {
	var type = typeOf(a);
	var s = "";
	
	if (type !== "Object" && type !== "Array") {
    	if (type === "String") {
        	s += '"' + a.toString() + '"';
        } else {
			s += a.toString();
        }
	}

	var len = false;
	if (type === "Object") {
		s += "{";
		for (var i in a) {
			if (a.hasOwnProperty(i)) {
				s += i + ":" + toStr(a[i]) + ",";
				len = true;
			}
		}
	    if (len === true) {
			s = s.slice(0, -1);
		}
		s += "}";
	} else if (type === "Array") {
    	s += "[";
		for (var i = 0; i < a.length; i++) {
			s += toStr(a[i]) + ",";
			len = true;
		}
        if (len === true) {
			s = s.slice(0, -1);
		}
        s += "]";
	}
    
	return s;
}

// return type
function typeOf(o) {
	return {}.toString.call(o).split(" ")[1].slice(0, -1);
}
