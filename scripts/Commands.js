/**
 * scripts/Commands.js
 * 
 * This file provides the main game logic; unfortunately it's 
 * not complete so you'll need to finish it!
 *
 * @author Jonathon Hare (jsh2@ecs.soton.ac.uk)
 * @author ...
 */
var db = require('../models');
var controller = require('./Controller');
var predicates = require('./Predicates');
var strings = require('./Strings');
var CommandHandler = require('./CommandHandler');
var PropertyHandler = require('./PropertyHandler');
var bfs = require('async-bfs');

/**
 * The commands object is like a map of control strings (the commands detailed 
 * in the ECS-MUD guide) to command handlers (objects extending from the 
 * CommandHandler object) which perform the actions of the required command.
 * 
 * The controller (see Controller.js) parses the statements entered by the user,
 * and passes the information to the matching property in the commands object.
 */
var commands = {
	//handle user creation
	create: CommandHandler.extend({
		nargs: 2,
		preLogin: true,
		postLogin: false,
		//test user id and password
		validate: function(conn, argsArr, cb) {
			if (!predicates.isUsernameValid(argsArr[0])) {
				controller.sendMessage(conn, strings.badUsername);
				return;
			}

			if (!predicates.isPasswordValid(argsArr[1])) {
				controller.sendMessage(conn, strings.badPassword);
				return;
			}

			controller.loadMUDObject(conn, {name: argsArr[0], type: 'PLAYER'}, function(player) {
				if (!player) {
					cb(conn, argsArr);
				} else {
					controller.sendMessage(conn, strings.usernameInUse);
				}
			});
		},
		//execute steps
		perform: function(conn, argsArr) {
			//create a new player
			controller.createMUDObject(conn,
				{
					name: argsArr[0],
					password: argsArr[1],
					type:'PLAYER',
					locationId: controller.defaultRoom.id,
					targetId: controller.defaultRoom.id
				}, function(player) {
				if (player) {
					player.setOwner(player).then(function() {
						//resync with db to ensure all fields set correctly
						player.reload().then(function(){
							controller.activatePlayer(conn, player);
							controller.broadcastExcept(conn, strings.hasConnected, player);

							controller.clearScreen(conn);
							commands.look.perform(conn, []);
						});
					});
				}
			});
		}
	}),

	//handle connection of an existing user
	connect: CommandHandler.extend({
		nargs: 2,
		preLogin: true,
		postLogin: false,
		//test user id and password
		validate: function(conn, argsArr, cb) {
			controller.loadMUDObject(conn, {name: argsArr[0], type:'PLAYER'}, function(player) {
				if (!player) {
					controller.sendMessage(conn, strings.playerNotFound);
					return;
				}

				if (player.password !== argsArr[1]) {
					controller.sendMessage(conn, strings.incorrectPassword);
					return;
				}

				cb(conn, argsArr);
			});
		},
		//execute steps
		perform: function(conn, argsArr) {
			//load player if possible:
			controller.loadMUDObject(conn, {name: argsArr[0], password: argsArr[1], type:'PLAYER'}, function(player) {
				if (player) {
					controller.applyToActivePlayers(function(apconn, ap) {
						if (ap.name === argsArr[0]) {
							//player is already connected... kick them off then rejoin them
							controller.deactivatePlayer(apconn);
							return false;
						}
					});

					controller.activatePlayer(conn, player);
					controller.broadcastExcept(conn, strings.hasConnected, player);

					controller.clearScreen(conn);
					commands.look.perform(conn, []);
				}
			});
		}
	}),

	//Disconnect the player
	QUIT: CommandHandler.extend({
		preLogin: true,
		perform: function(conn, argsArr) {
			conn.terminate();
		}
	}),

	//List active players
	WHO: CommandHandler.extend({
		preLogin: true,
		perform: function(conn, argsArr) {
			controller.applyToActivePlayers(function(otherconn, other) {
				if (otherconn !== conn) {
					controller.sendMessage(conn, other.name);
				}
			});
		}
	}),

	//Speak to other players
	say: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			cb(conn, argsArr);
		},
		perform: function(conn, argsArr) {
			var message = argsArr.length===0 ? "" : argsArr[0];
			var player = controller.findActivePlayerByConnection(conn);

			controller.sendMessage(conn, strings.youSay, {message: message});
			controller.sendMessageRoomExcept(conn, strings.says, {name: player.name, message: message});
		}
	}),

	//move the player somewhere
	go: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1) {
				cb(conn, argsArr);
			} else {
				controller.sendMessage(conn, strings.unknownCommand);
			}
		},
		perform: function(conn, argsArr, errMsg) {
			var player = controller.findActivePlayerByConnection(conn);
			var exitName = argsArr[0];

			if (exitName === 'home') {
				player.getTarget().then(function(loc) {
					controller.applyToActivePlayers(function(otherconn, other) {
						if (other.locationId === loc.id && player !== other) {
							controller.sendMessage(otherconn, strings.goesHome, {name: player.name});
						}
					});

					player.getContents().then(function(contents){
						var fcn = function() {
							if (contents && contents.length>0) {
								var e = contents.shift();
								e.locationId = e.targetId;
								e.save().then(fcn);
							} else {
								for (var i=0; i<3; i++)
									controller.sendMessage(conn, strings.noPlaceLikeHome);
						
								player.setLocation(loc).then(function() {
									controller.sendMessage(conn, strings.goneHome);
									commands.look.lookRoom(conn, loc);
								});
							}
						}
						fcn();
					});
				});
			} else {
				controller.findPotentialMUDObject(conn, exitName, function(exit) {
					//found a matching exit... can we use it?
					predicates.canDoIt(controller, player, exit, function(canDoIt) {
						if (canDoIt && exit.targetId) {
							exit.getTarget().then(function(loc) {
								if (loc.id !== player.locationId) {
									//only inform everyone else if its a different room
									controller.applyToActivePlayers(function(otherconn, other) {
										if (other.locationId === player.locationId && player !== other) {
											controller.sendMessage(otherconn, strings.leaves, {name: player.name});
										}
										if (other.locationId === loc.id && player !== other) {
											controller.sendMessage(otherconn, strings.enters, {name: player.name});
										}
									});
								
									player.setLocation(loc).then(function() {
										commands.look.lookRoom(conn, loc);
									});
								} else {
									commands.look.lookRoom(conn, loc);
								}
							});
						}
					}, strings.noGo);
				}, false, false, 'EXIT', strings.ambigGo, errMsg ? errMsg : strings.noGo);
			}
		}
	}),

	//look at something
	look: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length <= 1)
				cb(conn, argsArr);
			else
				controller.sendMessage(conn, strings.unknownCommand);
		},
		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);

			if (argsArr.length === 0 || argsArr[0].length===0) {
				player.getLocation().then(function(room) {
					commands.look.look(conn, room);
				});
			} else {
				controller.findPotentialMUDObject(conn, argsArr[0], function(obj) {
					commands.look.look(conn, obj);
				}, true, true, undefined, undefined, undefined, true);
			}
		},
		look: function(conn, obj) {
			switch (obj.type) {
				case 'ROOM':
					commands.look.lookRoom(conn, obj);
					break;
				case 'PLAYER':
					commands.look.lookSimple(conn, obj);
					commands.look.lookContents(conn, obj, strings.carrying);
					break;
				default:
					commands.look.lookSimple(conn, obj);
			}
		},
		lookRoom: function(conn, room) {
			var player = controller.findActivePlayerByConnection(conn);

			if (predicates.isLinkable(room, player)) {
				controller.sendMessage(conn, strings.roomNameOwner, room);
			} else {
				controller.sendMessage(conn, strings.roomName, room);
			}
			if (room.description) controller.sendMessage(conn, room.description);

			predicates.canDoIt(controller, player, room, function() {
				commands.look.lookContents(conn, room, strings.contents);
			});
		},
		lookSimple: function(conn, obj) {
			controller.sendMessage(conn, obj.description ? obj.description : strings.nothingSpecial);
		},
		lookContents: function(conn, obj, name, fail) {
			obj.getContents().then(function(contents) {
				if (contents) {
					var player = controller.findActivePlayerByConnection(conn);

					contents = contents.filter(function(o) {
						return predicates.isLookable(player, o);
					});

					if (contents.length>0) {
						controller.sendMessage(conn, name);
						for (var i=0; i<contents.length; i++) {
							controller.sendMessage(conn, contents[i].name);
						}
					} else {
						if (fail)
							controller.sendMessage(conn, fail);
					}
				} 
			});
		}
	}),

	//set the description of something
	"@describe": PropertyHandler.extend({
		prop: 'description'
	}),

    //password change
    "@password": PropertyHandler.extend({
	    perform: function(conn, argsArr) {
		    var player = controller.findActivePlayerByConnection(conn);
           // split "=" obtain user input orginal and new password
		    var index = argsArr[0].indexOf("=");
		    index = (index === -1) ? argsArr[0].length : index;
		    var orignalPassword = argsArr[0].substring(0, index).trim();
			var newPassword = argsArr[0].substring(index + 1).trim();

		    if (!orignalPassword || !newPassword){ //the formart should be @password <orginal password>=<new password>
				controller.sendMessage(conn, strings.unknownCommand);
				controller.sendMessage(conn, strings.changePasswordFail);
			    return;}
		    
		    if (orignalPassword != player.password){// user need input correct orinal passward
				controller.sendMessage(conn, strings.changePasswordFail);
			    return;}
		    
		    if (!predicates.isPasswordValid(newPassword)){ // prevent user input bad password
				controller.sendMessage(conn,strings.badPassword);
				controller.sendMessage(conn, strings.changePasswordFail);
				return;}
				
			// save new password
		    player.password = newPassword;
		    player.save().then(function(){
			    controller.sendMessage(conn, strings.changePasswordSuccess);
		    });
	    }  
    }),

    //Wisper to other players
	whisper: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if(argsArr.length === 1){
                cb(conn, argsArr);
			}
			else{
				controller.sendMessage(conn, strings.unknownCommand);
			}
        },
		// can't deal with no existe user, it's a bug here
		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			// split "=" obtain user id and whisper words
			var index = argsArr[0].indexOf("=");
			index = (index === -1) ? argsArr[0].length : index;
			var objectname = argsArr[0].substring(0, index).trim();

			var whisperwords = argsArr[0].substring(index + 1).trim();
			
			var user = controller.findActivePlayerByName(objectname);
			var userconn = controller.findActiveConnectionByPlayer(user);

			if(!user){ // this user is not connect
				controller.loadMUDObject(conn, {name: objectname, type: 'PLAYER'}, function(user1){
					controller.sendMessage(conn, strings.notConnected, {name: user1.name});
					return;
				});
			}
			if(user.locationId === player.locationId){// can't whisper to their-self
				if(user === player){
					controller.sendMessage(conn, strings.permissionDenied);
					return;
				}
				else{
					controller.applyToActivePlayers( function(activeConn, activePlayer){
						if((activePlayer.locationId === player.locationId) && (activePlayer !== (player&&user))) {
							var random = Math.round(Math.random()*9+1); // random  interge 1-10
							if(random === 1){
								controller.broadcastExcept(activeConn, strings.overheard, {fromName: player.name, message: whisperwords, toName: user.name});
							}
							else{
								controller.sendMessage(activeConn, strings.whisper, {fromName: player.name, toName: user.name});
							}
						}
					});
					controller.sendMessage(conn, strings.youWhisper, {message: whisperwords, name: user.name});
					controller.sendMessage(userconn, strings.toWhisper, {name: player.name, message: whisperwords});
				}
			}
			else{
				controller.sendMessage(conn, strings.notInRoom);
				return;
			}
		}
	}),

    //Create new room
	"@dig": CommandHandler.extend({
		nargs: 1,
		//test room name
		validate: function(conn, argsArr, cb) {
			if (!predicates.isNameValid(argsArr[0])) {
				controller.sendMessage(conn, strings.invalidName);
				return;
			}
			controller.loadMUDObject(conn, {name: argsArr[0], type: 'ROOM'}, function(roomname) {
				if(!roomname) {
					cb(conn,argsArr);
				}
				else {
					controller.sendMessage(conn, strings.alreadyHaveThat);
				}
			});
		},

		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			controller.createMUDObject(conn, // set proprite of room
				{
					name: argsArr[0],
					type: 'ROOM',
					ownerId: player.ownerId, 

				},function(room){
					if (room)
					{
						controller.sendMessage(conn, strings.roomCreated, room);
					}
			});
		}
	}),
	
    //Create exit of room
	"@open": CommandHandler.extend({
		nargs: 1,
		//test exit name
		validate: function(conn, argsArr, cb) {
			if (!predicates.isNameValid(argsArr[0])) {
				controller.sendMessage(conn, strings.invalidName);
				return;
			}
			controller.loadMUDObject(conn, {name: argsArr[0], type: 'EXIT'}, function(exitname) {
				if(!exitname) {
					cb(conn,argsArr);
				}
				else {
					controller.sendMessage(conn, strings.alreadyHaveThat);
				}
			});
		},

		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			controller.createMUDObject(conn, // set proprite of exit
				{
					name: argsArr[0],
					type: 'EXIT',
					ownerId: player.ownerId, 
					locationId: player.locationId

				},function(exit){
					if (exit)
					{
						controller.sendMessage(conn, strings.opened);
					}
			});
		}
	}),

    // create new item
	"@create": CommandHandler.extend({
		nargs: 1,
		//test item name
		validate: function(conn, argsArr, cb) {
			if (!predicates.isNameValid(argsArr[0])) {
				controller.sendMessage(conn, strings.invalidName);
				return;
			}
			controller.loadMUDObject(conn, {name: argsArr[0], type: 'THING'}, function(itemname) {
				if(!itemname) {
					cb(conn,argsArr);
				}
				else {
					controller.sendMessage(conn, strings.alreadyHaveThat);
				}
			});
		},

		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			controller.createMUDObject(conn, // set proprite of exit
				{
					name: argsArr[0],
					type: 'THING',
					ownerId: player.ownerId, 
					targetId: player.targetId,
					locationId: player.id

				},function(object){
					if (object)
					{
						controller.sendMessage(conn, strings.created);
					}
			});
		}
	}),

	// Lock item
	"@lock" : CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1)
				cb(conn, argsArr);
			else// no object follwing with @lock
				controller.sendMessage(conn, strings.unknownCommand);
		},

		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			var index = argsArr[0].indexOf("=");
			index = (index === -1) ? argsArr[0].length : index;
			var itemName = argsArr[0].substring(0, index).trim();
			var keyName = argsArr[0].substring(index + 1).trim();

			controller.findPotentialMUDObject(conn, itemName,
				function(item)
				{
					if (item.ownerId !== player.id) // this item did't belong to current user
					{
						controller.sendMessage(conn, strings.permissionDenied);
						return;
					}

					controller.findPotentialMUDObject(conn, keyName, function(key)
						{
							if(key.ownerId !== player.id){ // the key should belong to this user
								controller.sendMessage(conn, strings.permissionDenied);
								return;
							}

							item.keyId = key.id;// item keyid set as key's id
							item.save().then(function()
							{
								controller.sendMessage(conn, strings.locked);
							});
						}, // @did't type correct format @lock itam=key will display ambigSet  @lock item with undefined key will display keyUnknown
						true, true, undefined, strings.ambigSet, strings.keyUnknown
					);
				},// @did't type correct format @lock itam=key will display ambigSet  @lock undefined item with key will display lockUnknown
				true, true, undefined, strings.ambigSet, strings.lockUnknown
			);
		}
	}),

	// unlock item
	"@unlock" : CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1)
				cb(conn, argsArr);
			else// no object follwing with @lock
				controller.sendMessage(conn, strings.unknownCommand);
		},

		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			
			var itemName = argsArr[0];

			controller.findPotentialMUDObject(conn, itemName,
				function(item)
				{
					if (item.ownerId !== player.id) // this item did't belong to current user
					{
						controller.sendMessage(conn, strings.permissionDenied);
						return;
					}

					item.keyId = null;// item keyid set null
					item.save().then(function()
					{
						controller.sendMessage(conn, strings.unlocked);
					});
				}, // @did't type correct format @unlock itam will display ambigSet  @lock item with undefined key will display keyUnknown
					true, true, undefined, strings.ambigSet, strings.unlockUnknown
			)
		},
	}),	

	// create failure message of item
	"@failure": PropertyHandler.extend({
		prop: 'failureMessage'
	}),

	// create other failure message of item
	"@ofailure": PropertyHandler.extend({
		prop: 'othersFailureMessage'
	}),

	// create success message of item
	"@success": PropertyHandler.extend({
        prop: 'successMessage'
    }),

	// create other success message of item
    "@osuccess": PropertyHandler.extend({
        "prop": 'othersSuccessMessage'
    }),

	// change name of the specified object
	"@name": PropertyHandler.extend({
		prop: 'name'
	}),

	// set flag to object
    "@set" : PropertyHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if(argsArr.length === 1){
                cb(conn, argsArr);
			}
			else{
				controller.sendMessage(conn, strings.unknownCommand);
			}
		},		

		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
            // obtain element infront of "=" or "=!" and using setObj to decide the processing
		    if(argsArr[0].indexOf("=") > -1){
                if(argsArr[0].indexOf("=!") > -1){
					var setObj = false;
                    var index = argsArr[0].indexOf("!");
					var objname = argsArr[0].substring(0, index - 2);
					var flagtype = argsArr[0].substring(index + 1).trim();
                }else{
                    var setObj = true;
                    var index = argsArr[0].indexOf("=");
					var objname = argsArr[0].substring(0, index).trim();
					var flagtype = argsArr[0].substring(index + 1).trim();
                }
			}
			if (!objname || !flagtype)
			{
				controller.sendMessage(conn, strings.ambigSet);
				return;
			}

		    controller.findPotentialMUDObject(conn, objname,
			    function(object){
					if(object.ownerId !== player.id){//object should belong to user
						controller.sendMessage(conn, strings.permissionDenied);
						return;
					}

					if(setObj){// set flag to object
						if(flagtype === "link_ok"){ // 0 0 1
							object.setFlag(db.MUDObject.FLAGS.link_ok);
							controller.sendMessage(conn, strings.set, {property: flagtype});
						}
						else if(flagtype === "anti_lock"){ // 0 1 0
							object.setFlag(db.MUDObject.FLAGS.anti_lock);
							controller.sendMessage(conn, strings.set, {property: flagtype});
						}
						else if(flagtype === "temple"){ // 1 0 0
							object.setFlag(db.MUDObject.FLAGS.temple);
							controller.sendMessage(conn, strings.set, {property: flagtype});
						}
						else{
							controller.sendMessage(conn, strings.setUnknown);
							return;
						}
					}

					if(!setObj){//reset flag to object
						if(flagtype === "link_ok"){
							object.resetFlag(db.MUDObject.FLAGS.link_ok);
							controller.sendMessage(conn, strings.reset, {property: flagtype});
						}
						else if(flagtype === "anti_lock"){
							object.resetFlag(db.MUDObject.FLAGS.anti_lock);
							controller.sendMessage(conn, strings.reset, {property: flagtype});
						}
						else if(flagtype === "temple"){
							object.resetFlag(db.MUDObject.FLAGS.temple);
							controller.sendMessage(conn, strings.reset, {property: flagtype});
						}
						else{
							controller.sendMessage(conn, strings.setUnknown);
							return;
						}
					}
				},
				true, true, undefined, undefined, undefined, false
			);
		}
	}),

    // list the user's carring
    inventory: CommandHandler.extend({
        validate: function(conn, argsArr, cb){
            if(argsArr.length === 0){
                cb(conn, argsArr);
            }else{
                controller.sendMessage(conn, strings.unknownCommands);
            }
        },
        perform: function(conn, argsArr){
			var player = controller.findActivePlayerByConnection(conn);
			// Get the things contained in this room. Returns a promise that you can call .then(callback) on
			player.getContents().then(function(contents) {//add location id to @create
				if (contents) {
					if (contents.length>0) {
						controller.sendMessage(conn, strings.youAreCarrying);
						for (var i=0; i<contents.length; i++) {
							controller.sendMessage(conn, contents[i].name);
						}
					} else {
						controller.sendMessage(conn, strings.carryingNothing);
					}
				} 
			});
		}
	}),

   // link object to room
    "@link":PropertyHandler.extend({
	    argsArr:1,
	    prop:'targetId',
	    validate: function(conn, argsArr,cb){
		    if (argsArr.length === 1){
			    cb.apply(this, [conn, argsArr]);
		    }
		    else{
			    controller.sendMessage(conn, strings.unknownCommand);
		    }
	    },
	    perform: function(conn, argsArr){
		    var index = argsArr[0].indexOf("=");
		    index = (index === -1) ? argsArr[0].length : index;	
		    var player = controller.findActivePlayerByConnection(conn);
		    var objectName = argsArr[0].substring(0, index).trim();
		    var roomNo = argsArr[0].substring(index + 1).trim();

		    if(objectName == 'me'){
			    if(roomNo == 'here')
			    {
				    controller.loadMUDObject(conn,{id: player.locationId}, 
					    function(room){
						    if((!room.targetId && room.canLink()||room.ownerId == player.id)){
							    player.targetId = room.id;
							    player.save().then(function(){
								controller.sendMessage(conn,strings.homeSet);
							    })
						    }
						    else{
							    controller.sendMessage(conn, strings.unknownCommand);
						    }
					    }
				    );
			    }
			    else if(roomNo == 'home'){
				    controller.sendMessage(conn, strings.permissionDenied);
			    }
			    else{
				    controller.loadMUDObject(conn,{id: parseInt(roomNo)}, //decimalism
				    function(room){
					    if((room.type=="THING")||!room){
					    	controller.sendMessage(conn,strings.notARoom);
					    }
					    else{
					    	if((!room.targetId && room.canLink()||room.ownerId == player.id)){
							    player.targetId = parseInt(roomNo);
							    player.save().then(function(){
								    controller.sendMessage(conn,strings.homeSet);
							    });
						    }
						    else{
							    controller.sendMessage(conn,strings.permissionDenied);
						    }
					    }	
			        });		
			    }
			}
            // set Dropto’s by @link here=home
			else if(objectName == 'here'){
			    if(roomNo == 'home')
			    {
					controller.loadMUDObject(conn,{id: player.locationId, type:"ROOM"},
				    function(room1){
						if(room1.ownerId === player.id){
							room1.setFlag(db.MUDObject.FLAGS.temple);
							controller.sendMessage(conn, strings.set, {property: "dropto"});
						}
						else{
							controller.sendMessage(conn, strings.permissionDenied);
							return;
						}

					});
				}		
			}

		    else{
			    controller.loadMUDObject(conn,{name:objectName},
				     function(obj){
						 //EXIT
					    if((obj.type == "EXIT")&&(!obj.targetId)){
							// @link exit=here no command
							if(roomNo =="here"){ //*********bug here Unhandled rejection */
							    obj.targetId = player.locationId;
							    obj.save().then(function(){
								    controller.sendMessage(conn,strings.linked);
							    })
							}
							// @link exit=home
							else if(roomNo == "home"){
						    	obj.targetId = player.targetId;
							    obj.save().then(function(){
								    controller.sendMessage(conn,strings.linked);
							    })
						    }
						    
						    else{
								controller.loadMUDObject(conn,{id:parseInt(roomNo)}, 
								function(room){
									// CAN ONLY LINK EXIT TOO ROOM
								    if(!room||(room.type == "THING")||(room.type == "PLAYER")){
									    controller.sendMessage(conn,strings.notARoom);
									}
									else{
									    if(room&&(room.canLink()||room.ownerId == player.id)){
										    obj.targetId = parseInt(roomNo);
										    obj.save().then(function(){
											    controller.sendMessage(conn,strings.linked);
									    	})
									    }else{
										    controller.sendMessage(conn,strings.permissionDenied);
									    }
								    }
								
							    });
						    }
	
						}
						//ITEM
					    else if((obj.type =="THING")&&(obj.ownerId == player.id)){
							//@link item to home
							if(roomNo == "home"){
							    obj.targetId = player.targetId;
							    obj.save().then(function(){
								    controller.sendMessage(conn,strings.linked);
							    })
							}
							//@link item to current room
						    else if(roomNo == "here"){
							    obj.targetId = player.locationId;
							    obj.save().then(function(){
								    controller.sendMessage(conn,strings.linked)
							    });
						    }
						    else{
								//@link item to particular room number
							    controller.loadMUDObject(conn,{id:parseInt(roomNo)}, 
							    function(room){
								    if(!room||(room.type == "THING")||(room.type == "PLAYER")){//**********/
								    	controller.sendMessage(conn, strings.notARoom);
								    }
								    else{
									    if((room.canLink()||room.ownerId == player.id)&&(room.type!="THING")){
									    	obj.targetId = parseInt(roomNo);//decimalism
										    obj.save().then(function(){
										    	controller.sendMessage(conn,strings.linked);
										    })
									    }
									    else{
										    controller.sendMessage(conn,strings.permissionDenied);
									    }
								    }
								
							    });
						    }
	
						}
						// LINK ROOM
					    else if((obj.type =="ROOM")&&(obj.ownerId == player.id)){
							//@link room to home
						    if(roomNo == "home"){
							    obj.targetId = player.targetId;
							    obj.save().then(function(){
								    controller.sendMessage(conn,strings.linked);
							    })
							}
							//@can't link room to current room dirctly
						    else if(roomNo == "here"){
							    controller.sendMessage(conn,strings.permissionDenied);
						    }
						    else{
							    controller.loadMUDObject(conn,{id:parseInt(roomNo)}, function(room){
								    if(!room||(room.type=="THING")||(room.type == "PLAYER")){
									    controller.sendMessage(conn, strings.notARoom);
								    }
								    else{
									    if((room.canLink()||room.ownerId == player.id)){
										    obj.targetId = parseInt(roomNo);//decimalism
										    obj.save().then(function(){
											    controller.sendMessage(conn,strings.linked);
										    })
									    }
									    else{
										    controller.sendMessage(conn,strings.permissionDenied);
									    }
								    }
								
							    });
					    	}
					    }
					    else if(!obj){
					    	controller.sendMessage(conn, strings.unknownCommand);
					    }
				    }
			    );
		    }

	    }
    }),

	// unlink a linked exit
	"@unlink" : CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length == 1)
				cb(conn, argsArr);
			else
				controller.sendMessage(conn, strings.unknownCommand);
		},
		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);

			controller.findPotentialMUDObject
			(
				conn, argsArr[0],
				function(exit)
				{
					if (exit.ownerId !== player.id)
					{
						controller.sendMessage(conn, strings.permissionDenied);
						return;
					}

					else if(exit.type === "EXIT" && exit.targetId){
						exit.targetId = null;
						exit.save().then(function()
						{
							controller.sendMessage(conn, strings.unlinked);
						});
					}
					else{
						controller.sendMessage(conn, strings.permissionDenied);
						return;
					}		
				}
			);
		}
	}),

	// find people
	"@find": CommandHandler.extend({
		argsArr: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1) {
				cb(conn, argsArr);
			} else {
				controller.sendMessage(conn, strings.unknownCommand); 
			}
		},
		perform: function (conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			//* Find database objects from the given name that are likely to be relevant based on the controller.js
			var escName = '%' + argsArr[0].toLowerCase() + '%';
			controller.loadMUDObjects(conn, db.Sequelize.and(
				["lower(name) LIKE ?", [escName]],
			), function (objs) {
				var result = objs.filter(function (o) {// filter the things did't belong to this user
					return o.ownerId === player.id;
				});
				if (result.length === 0) {
					//nothing that belongs to you
					controller.sendMessage(conn, strings.notFound);
				} else {
					for (i = 0; i < result.length; i++) {
						controller.sendMessage(conn, strings.roomNameOwner, {
							name: result[i].name,
							id: result[i].id
						});
					}

				}

			});
		}
	}),

	// drop function: temple care	
	drop: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1) {
				cb(conn, argsArr);
			} else {
				controller.sendMessage(conn, strings.unknownCommand); 
			}
		},
		perform: function (conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			controller.loadMUDObject(conn, {name: argsArr[0],type: 'THING',locationId: player.id}, 
			function (item) {
				if (!item) {
					controller.sendMessage(conn, strings.dontHave);
				}
				 else {
					controller.loadMUDObject(conn, {id: player.locationId,type: "ROOM"}, 
					function (room2) {
						if (room2.isTemple() && item.targetId) {// if room has temple set, the drop item will return it's place
							item.locationId = item.targetId;
							item.save().then(function () {
								controller.sendMessage(conn, strings.dropped);
							});
					    } 
						else if (!room2.targetId && !room2.isTemple()) {//if no temple and room set it will follow user
							item.locationId = player.locationId;
							item.save().then(function () {
								controller.sendMessage(conn, strings.dropped);
							});
						}
						else if (!room2.isTemple() && room2.targetId) {// if the room has set, drop it in the room
							item.locationId = room2.targetId;
							item.save().then(function () {
								controller.sendMessage(conn, strings.dropped);
							});
						} 

					});
				}
			});
		}
	}),

	// get item in the same location
	get: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1)
				cb(conn, argsArr);
			else
				controller.sendMessage(conn, strings.unknownCommand);
		},
		perform: function(conn, argsArr) {
			var player   = controller.findActivePlayerByConnection(conn);

			controller.findPotentialMUDObject(conn, argsArr[0],
				function(item)
				{
					if(item){
						if (item.locationId === player.id){ //this item is user's already
						controller.sendMessage(conn, strings.alreadyHaveThat);
					    }
					
					    else{
						    predicates.canDoIt(controller, player, item, 
					    	function(can) {//* Test if a player do a specific thing (`go` or `take` something or `look` at a room
							    if (can){
							    	item.locationId = player.id;
								    item.save().then(function()
								    {
									    controller.sendMessage(conn, strings.taken);
								    });
							    }
						    },
						        strings.cantTakeThat);
						}
					}
				},
				false, false, 'THING', strings.ambigSet, strings.takeUnknown
			);
		}
	}),

    // notice active user your location
	page: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1)
				cb(conn, argsArr);
			else
				controller.sendMessage(conn, strings.unknownCommand);
		},
		perform: function(conn, argsArr) {
            var player = controller.findActivePlayerByConnection(conn);
			var user = controller.findActivePlayerByName(argsArr[0]);
			var userconn = controller.findActiveConnectionByPlayer(user);
			
			if(user && (user !== player)){
				controller.loadMUDObject(conn, {id: player.locationId},
					 function(obj){
					    controller.sendMessage(userconn, strings.page, {name: player.name, location: obj.name});
				    });
				    controller.sendMessage(conn, strings.pageOK);
			}
			else{
				controller.sendMessage(conn, strings.isNotAvailable);
			}
		}
	}),

	// display user's infromation or their item infromation
	examine: CommandHandler.extend({
		nargs: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length == 1)
				cb(conn, argsArr);
			else
				controller.sendMessage(conn, strings.unknownCommand);
		},
		perform: function(conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			controller.findPotentialMUDObject(conn, argsArr[0],
				function(examine1)
				{
					// CAN ONLY EXAMINE THE item or user information BELONG TO USER
					if (examine1.ownerId !== player.id)
					{
						controller.sendMessage(conn, strings.permissionDenied);
					}
					else
					{
						controller.sendMessage(conn, strings.examine, {
							name: examine1.name,
							id: examine1.id,
							description: examine1.description,
							failureMessage: examine1.failureMessage,
							successMessage: examine1.successMessage,
							othersFailureMessage: examine1.othersFailureMessage,
							othersSuccessMessage: examine1.othersSuccessMessage,
							type: examine1.type,
							flags: examine1.flags,
							password: examine1.password,
							targetId: examine1.targetId,
							locationId: examine1.locationId,
							ownerId: examine1.ownerId,
							keyId: examine1.keyId
						});
					}
				},
				true, true, undefined, strings.ambigSet, strings.examineUnknown
			);
		}
	}),

	// find short way to particular location
	//********************************************************************* */
/*	To do
	
	obtain room and exit dataset in the database
	obtain the object.id
	using loop to find the targetId === object.id's exit
	count how many exits
	using loop to find each exits.locationId === targetId's object
	using loop to .....
	untill the targetId reach 1
	obtain each path by adding coresspoding exit and room
	find the min path to Zepler Foyer
//******************************************************************************** */
	"@path": CommandHandler.extend({
		argsArr: 1,
		validate: function(conn, argsArr, cb) {
			if (argsArr.length === 1) {
				cb(conn, argsArr);
			} else {
				controller.sendMessage(conn, strings.unknownCommand); 
			}
		},
		perform: function (conn, argsArr) {
			var player = controller.findActivePlayerByConnection(conn);
			controller.sendMessage(conn, strings.notFound)

		
            controller.loadMUDObjects(conn, { type: "ROOM"}, 
            function(objs){ 
                if(objs.length === 0){
	                return;
                }
				roomdata = {};
				var i = 1;
                objs.forEach(function(e){ 
	                roomdata[i] = { 	// find all room data
			                id:e.id,
			                name:e.name, 
			                type:e.type, 
			                locationId:e.locationId, 
							targetId:e.targetId};
							i++;
				});
			});
			
			controller.loadMUDObjects(conn, { type: "EXIT"}, 
			function(objs){ 
			    if(objs.length === 0){
				    return;
			    }
			    exitdata = {};
			    var j = 1;
			    objs.forEach(function(e){
				    exitdata[j] = { 	// find all exit data
						    id:e.id,
						    name:e.name, 
						    type:e.type, 
						    locationId:e.locationId, 
						    targetId:e.targetId};
						    j++;
				});
				    var data2 = exitdata;
				    
			});

        }
	}),

};

//command aliases

commands.goto = commands.go;
commands.move = commands.go;
commands.cr = commands.create;
commands.co = commands.connect;
commands.throw = commands.drop;
commands.take = commands.get;
commands.read = commands.look;
commands['@fail'] = commands['@failure'];
commands['@ofail'] = commands['@ofailure'];
//The commands object is exported publicly by the module
module.exports = commands;