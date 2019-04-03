const url = require('url'),
	{ VK } = require('vk-io');

const VCoinWS = require('./VCoinWS');
const { con, ccon, formateSCORE, hashPassCoin, rl, askDonate,
	existsAsync,  writeFileAsync,  appendFileAsync, infLog, rand, onUpdates, } = require('./helpers');
let { USER_ID, DONEURL, VK_TOKEN } = require('./.config.js');


let vk = new VK();
let URLWS = false;
let boosterTTL = null,
	tryStartTTL = null,
	updatesEv = false,
	xRestart = true,
	flog = false,
	tforce = false;

onUpdates(msg=> {
	if(!updatesEv) updatesEv = msg;
	con(msg, "white", "Red");
});

// Инициализация главного модуля (:
let vConinWS = new VCoinWS(USER_ID);


let missCount = 0, missTTL = null;
vConinWS.onMissClickEvent(function() {
	if(0 === missCount) {
		clearTimeout(missTTL);
		missTTL = setTimeout(function() {
			missCount = 0;
			return;
		}, 6e4)
	}

	if(++missCount > 20)
		forceRestart(4e3);

	if(++missCount > 10)
		con("Ваши нажатия не засчитываются. Похоже, у Вас проблемы с подключением.", true);
});

vConinWS.onReceiveDataEvent(async function(place, score) {
	var n = arguments.length > 2 && void 0 !== arguments[2] && arguments[2];

	if(place > 0 && !rl.isQst) {

		if(updatesEv && !rand(0,1))
			con(updatesEv + "\t\t введи hideupd чтобы скрыть это", "white", "Red");
		
		con("В ТОПе: " + place + "\tСЧЕТ: "+ formateSCORE(score, true), "yellow");
		if(score > 3e7*3) await askDonate(vConinWS);
		// process.stdout.write("В ТОПе: " + place + "\tСЧЕТ: "+(score/1000)+"\r");
	}
});

vConinWS.onTransfer(async function(id, score) {
	let template = "Для id"+USER_ID+" Пришли coins ["+formateSCORE(score, true)+"] от vk.com/id"+id;
	con(template, "black", "Green");
	try { await infLog(template); }
	catch(e) { console.error(e); }
});
vConinWS.onWaitEvent(function(e) {
	con("WaitEvent: "+e);
});

vConinWS.onUserLoaded(function(place, score, items, top, firstTime) {
	con("onUserLoaded: \t" + place + "\t" + formateSCORE(score, true) /*+ "\t" + items + "\t" + top + "\t" + firstTime*/);

	boosterTTL && clearInterval(boosterTTL);
	boosterTTL = setInterval(_=> {
		rand(0, 5)>3 && vConinWS.click();
	}, 5e2);
});

vConinWS.onBrokenEvent(function() {
	con("onBrokenEvent", true);
});

vConinWS.onAlreadyConnected(function() {
	con("Открыто две вкладки", true);
	vConinWS.reconnect(URLWS);
	// forceRestart(30e3);
});

vConinWS.onOffline(function() {
	con("onOffline", true);
	forceRestart(2e4);
});

async function startBooster(tw) {
	tryStartTTL && clearTimeout(tryStartTTL);
	tryStartTTL = setTimeout(()=> {
		con("Try start...");

		vConinWS.userId = USER_ID;
		vConinWS.run(URLWS, _=> {
			con("Boost started");
		});
	}, (tw || 1e3));
}

function forceRestart(t) {
	vConinWS.close();
	boosterTTL && clearInterval(boosterTTL);
	if(xRestart)
		startBooster(t);
}


// Обработка командной строки
rl.on('line', async (line) => {
	if(!URLWS) return;

	switch(line.trim()) {
		case '':
			break;

		case 'info':
			let XXX = await vConinWS.getUserScores([ vConinWS.userId ]);
			console.log("Users score: ", XXX);
			break;

		case "hideupd":
			con("Уведомление скрыто.");
			updatesEv = false;
			break;

		case "stop":
		case "pause":
			xRestart = false;
			vConinWS.close();
			break;

		case "start":
		case "run":
			if(vConinWS.connected)
				return con("Уже запущено");
			xRestart = true;
			startBooster();
			break;

		case 'b':
		case 'buy':
			let item = await rl.questionAsync("Enter item name [cursor, cpu, cpu_stack, computer, server_vk, quantum_pc]: ");
			if(!item) return;
			let result;
			try {
				result = await vConinWS.buyItemById(item);
				if(result && result.items)
					delete result.items;
				console.log("Result BUY: ", result);
			} catch(e) {
				if(e.message == "NOT_ENOUGH_COINS") con("Недостаточно средств", true);
				else con(e.message, true);
			}			
			break;

		case 'tran':
		case 'transfer':
			let count = await rl.questionAsync("Сколько: ");
			let id = await rl.questionAsync("Кому: ");
			let conf = await rl.questionAsync("Точно? [yes]: ");
			if(conf != "yes" || !id || !count) return con("Отменено", true);

			try {
				await vConinWS.transferToUser(id, count);
				con("Успешный перевод.", "black", "Green");
				let template = "Отправили ["+formateSCORE(count*1e3*0.9, true)+"] coins от vk.com/id"+USER_ID+" для vk.com/i"+id;
				try { await infLog(template); } catch(e) {}
			} catch(e) {
				if(e.message == "BAD_ARGS") con("Где-то указан неверный аргумент", true);
				else con(e.message, true);
			}
			break;

		case "?":
		case "help":
			ccon("-- VCoins --", "red");
			ccon("info	- обновит текущий уровень");
			ccon("stop	- остановит майнер");
			ccon("run	- запустит майнер");
			ccon("buy	- покупка");
			ccon("tran	- перевод");
			ccon("hideupd - скрыть уведомление");
			break;
	}
});
// END



// Parse arguments
for (var argn = 2; argn < process.argv.length; argn++) {

	if(["-h", "-help", "-f", "-t", "-flog", "-autobuy", "-u", "-tforce"].includes(process.argv[argn])) {

		// Token
		if (process.argv[argn] == '-t') {
			let dTest = process.argv[argn + 1];
			if(typeof dTest == "string" && dTest.length > 80 && dTest.length < 90) {
				con("Token set.")
				VK_TOKEN = dTest;
				argn++;
				continue;
			}
		}

		// Custom URL
		if (process.argv[argn] == '-u') {
			let dTest = process.argv[argn + 1];
			if(typeof dTest == "string" && dTest.length > 200 && dTest.length < 255) {
				con("Custom URL set.");
				DONEURL = dTest;
				argn++;
				continue;
			}
		}

		// Force token
		if (process.argv[argn] == '-tforce') {
			con("Force token set.")
			tforce = true;
			continue;
		}

		// Автоматическая закупка
		if (process.argv[argn] == '-autobuy') {
			// Soon
			continue;
		}

		// Full log mode
		if (process.argv[argn] == '-flog') {
			flog = true;
			continue;
		}

		// Help info
		if (process.argv[argn] == "-h" || process.argv[argn] == "-help") {
			ccon("-- VCoins arguments --", "red");
			ccon("-help		- ...");
			ccon("-flog		- подробные логи");
			ccon("-tforce		- токен принудительно");
			ccon("-u [URL]	- задать ссылку");
			ccon("-t [TOKEN]	- задать токен");
			process.exit();
			continue;
		}
	}
}

// Попытка запуска
if(!DONEURL || tforce) {
	if(!VK_TOKEN) {
		con("Получить токен можно тут -> vk.cc/9eSo1E", true);
		return process.exit();
	}

	(async function inVKProc(token) {
		vk.token = token;
		try {
			let { mobile_iframe_url } = (await vk.api.apps.get({
				app_id: 6915965
			})).items[0];

			if(!mobile_iframe_url)
				throw("Ссылка на приложение не получена");
			
			if(!USER_ID) {
				let { id } = (await vk.api.users.get())[0];
				if(!id)
					throw("ID пользователя не получен");

				USER_ID = id;
			}

			formatWSS(mobile_iframe_url);
			startBooster();

		} catch(error) {
			console.error('API Error:', error);
			process.exit();
		}
	})(VK_TOKEN);
}
else {
	if(!USER_ID) {
		let GSEARCH = url.parse(DONEURL, true);
		if(!GSEARCH.query || !GSEARCH.query.vk_user_id) {
			con("В ссылке не нашлось vk_user_id", true);
			return process.exit();
		}
		USER_ID = parseInt(GSEARCH.query.vk_user_id);
	}

	formatWSS(DONEURL);
	startBooster();
}


function formatWSS(LINK) {
	let GSEARCH = url.parse(LINK),
		NADDRWS = GSEARCH.protocol.replace("https:", "wss:").replace("http:", "ws:") + "//" + GSEARCH.host + "/channel/";
	URLWS = NADDRWS + (USER_ID % 8) + GSEARCH.search + "&pass=".concat(hashPassCoin(USER_ID, 0));
	flog && console.log("formatWSS: ", URLWS);
	return URLWS;
}
