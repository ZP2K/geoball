(function(window, undefined) {
	try {
		if (window.self !== window.top || window !== window) {
			console.log("Please do not embed this game.");
			throw new Error();
			return;
		}
	} catch(e) {
		console.log("Please do not embed this game.");
		return;
	}

	// no browser support
	if (!!window.WebSocket === false || !!window.CanvasRenderingContext2D === false || (function() {
		// this is a double-check, just in case
		try {
			document.createElement("canvas").getContext("2d");
		} catch(e) {
			return false;
		}

		return true;
	})() === false) {
		console.log("Your browser is not supported.");
		return;
	}

	var canvas, ctx, ws, mouse, room, balls;

	function setup() {
		canvas = document.getElementById("canvas");
		ctx = canvas.getContext("2d");
		ws = new WebSocket("ws://geoball.mybluemix.net");
		mouse = {ld: false, rd: false};
		room = {w: 0, h: 0, x: 0, y: 0, b: 0, br: 0};

		canvas.width = 1920;
		canvas.height = 1080;
		ws.binaryType = "arraybuffer";

		(window.onresize = function() {
			canvas.style.width = window.innerWidth;
			canvas.style.height = (window.innerWidth / (canvas.width / canvas.height)) + "px";
		})();

		ws.onopen = function() {
			console.log("connected");

			ws.onmessage = function(d) {
				var data = new Uint8Array(d.data);
				// room w/h data
				if (data[0] === 0) {
					room.w = data[1] * 100;
					room.h = data[2] * 100;
					room.br = data[3];
				// room ball data
				} else if (data[0] === 1) {
					room.b = data[1];
				// x, y data
				} else if (data[0] === 2) {
					data = new Int16Array(d.data);
					room.x = data[1] / 10;
					room.y = data[2] / 10;
				// ball data
				} else if (data[0] === 3) {
					balls = new Int16Array(d.data);
				// player data
				} else if (data[0] === 4) {
					drawBackground();
					var after = drawBalls();

					data = new Int16Array(d.data);
					for (var i = 1, len = data.length; i < len; i += 7) {
						drawPlayer(data[i] / 10, data[i + 1] / 10, data[i + 2] / 10, data[i + 3] / 10, data[i + 4] / 10, data[i + 5] / 10, data[i + 6]);
					}

					if (after.length !== 0) {
						drawBalls(after);
					}
				}
			};

			canvas.onmousemove = function(e) {
				if ((mouse.ld === true && room.b !== 0) || mouse.rd === true) {
					var data = new Int16Array([0, e.clientX - (window.innerWidth / 2), e.clientY - (window.innerHeight / 2)]);
					ws.send(data.buffer);
				}
			};

			window.onkeydown = function(e) {
				if ([87, 65, 83, 68].indexOf(e.keyCode) !== -1) {
					var data = new Uint8Array([1, e.keyCode]);
					ws.send(data.buffer);
				}
			};

			window.onkeyup = function(e) {
				if ([87, 65, 83, 68].indexOf(e.keyCode) !== -1) {
					var data = new Uint8Array([2, e.keyCode]);
					ws.send(data.buffer);
				}
			};

			window.onmousedown = function(e) {
				if (e.which === 1 || e.which === 3) {
					var data = new Uint8Array([3, e.which]);
					ws.send(data.buffer);

					data = new Int16Array([0, e.clientX - (window.innerWidth / 2), e.clientY - (window.innerHeight / 2)]);
					ws.send(data.buffer);

					if (e.which === 1) {
						mouse.ld = true;
					} else {
						mouse.rd = true;
					}
				}
			};

			window.onmouseup = function(e) {
				if (e.which === 1 || e.which === 3) {
					var data = new Uint8Array([4, e.which]);
					ws.send(data.buffer);

					if (e.which === 1) {
						mouse.ld = false;
					} else {
						mouse.rd = false;
					}
				}
			};
		};
	}

	function circle(x, y, r, c, sb, sc, so) {
		ctx.beginPath();
		ctx.arc(x || 0, y || 0, r || 0, 0, 2 * Math.PI, false);
		ctx.closePath();
		ctx.fillStyle = c || "black";
		ctx.shadowBlur = sb || 0;
		ctx.shadowColor = sc || "black";
		ctx.shadowOffsetY = so || 0;
		ctx.fill();
	}

	function drawBackground() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		ctx.fillStyle = "lightgray";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = "white";
		ctx.fillRect((room.x + canvas.width / 2) - room.w / 2, (room.y + canvas.height / 2) - room.h / 2, room.w, room.h);

		ctx.lineWidth = 15;
		ctx.strokeStyle = "black";
		ctx.beginPath();
		ctx.arc(room.x + canvas.width / 2, room.y + canvas.height / 2, room.h / 4, 0, 2 * Math.PI, false);
		ctx.stroke();

		/*var spacing = canvas.width / 20;
		var offsetX = room.x % spacing;
		if (offsetX < 0) {
			offsetX += spacing;
		}

		for (var i = offsetX; i < canvas.width; i += spacing) {
			ctx.beginPath();
			ctx.moveTo(i, 0);
			ctx.lineTo(i, canvas.height);
			ctx.stroke();
		}

		var offsetY = room.y % spacing;
		if (offsetY < 0) {
			offsetY += spacing
		}

		for (var i = offsetY; i < canvas.height; i += spacing) {
			ctx.beginPath();
			ctx.moveTo(0, i);
			ctx.lineTo(canvas.width, i);
			ctx.stroke();
		}*/
	}

	function drawBall(x, y, r) {
		circle(x, y, r, "darkred", (r * r) * 0.04, "black", (r * r) * 0.04);
		circle(x, y, r * (0.75), "red");
	}

	function drawBalls(nb) {
		var arr = [];
		var newBalls = nb || balls;

		for (var i = nb == undefined ? 1 : 0, len = newBalls.length; i < len; i += 3) {
			if (nb == undefined && newBalls[i + 2] / 10 >= room.br + 5) {
				arr.push(newBalls[i], newBalls[i + 1], newBalls[i + 2]);
			} else {
				drawBall(newBalls[i] / 10, newBalls[i + 1] / 10, newBalls[i + 2] / 10);
			}
		}

		return arr;
	}

	function drawPlayer(x, y, tx, ty, t1x, t1y, balls) {
		circle(x, y, 35, "black");
		circle(x, y, 35 * 0.75, "white");

		if (balls >= 1) {
			drawBall(tx, ty, room.br + 10);
		}

		if (balls >= 2) {
			drawBall(t1x, t1y, room.br + 10);
		}

		circle(tx, ty, 35 / 2, "black");
		circle(tx, ty, (35 / 2) * 0.65, "white");

		circle(t1x, t1y, 35 / 2, "black");
		circle(t1x, t1y, (35 / 2) * 0.65, "white");
	}

	if (document.readyState !== "loading") {
		setup();
	} else if (document.addEventListener != undefined) {
		document.addEventListener("DOMContentLoaded", function load() {
			setup();
			document.removeEventListener("DOMContentLoaded", load);
		});
	} else if (document.attachEvent != undefined) {
		document.attachEvent("onreadystatechange", function load() {
			setup();
			document.dispatchEvent("onreadystatechange", load);
		});
	} else {
		window.onload = function() {
			setup();
			window.onload = undefined;
		};
	}

	document.oncontextmenu = function() {
		return false;
	};
})(window);
