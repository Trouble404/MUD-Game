#MCU-Javascript

**nodejs-Javascript application**

**Available in [main page](https://comp3207-cw1-1718-jz1g17.herokuapp.com/)**

![image](https://github.com/Trouble404/MUD-Game/blob/master/readme_add_pic/main_page.PNG)

---

## Preparation

### 1 Setting up
To run the application you'll need to gather all cloud services credentials and configure them in **example.env** and **app.yaml**.

[node.js](https://nodejs.org/download/)   

### 2 Dependencies installing
After setting up all the configurations, the first thing is to install all the dependencies. For Python, we used **Pip** to manage all the backend dependencies. For JavaScript, we used **Npm/Yarn** to do the frontend denpendencies management.
1. Clone the repository
```bash
git https://github.com/Trouble404/MUD-Game.git
```
2. Open the **MUD-Game** and install all the dependencies. 
Before you install the python dependencies 
```bash
npm install
node web.js
```
  To access the web interface, open a browser and navigate to [http://localhost:5000/](http://localhost:5000/)

3. To deploy this application to heroku server follow the instruction [**here**](https://devcenter.heroku.com/articles/git)

## Ordinary commands I 
*    @create <name<name>> Creates a thing with the specified name. The thing will belong to you and be placed in your inventory. By default it will have it’s home set to your home. 
*    @descibe <object<player>=descibtion<message><object>> <object> can be a room, thing, player, or direction that is in the same room as you, or in your inventory. Sets the description a player sees when they use the command look <object>. If <object> is here it sets the description for the current room that is displayed when the room is entered. If <object> is me it sets the description for your character. You can only set the description of an object you own. 
*    @dig <name<name>> Creates a new room with the specified name, and prints the room’s number. 
*    @failure <object> [ objective=message<message> ] Without a message argument, clears the failure message on <object>, otherwise sets it. The failure message is printed to a player when they unsuccessfully attempt to use the object. 
*    @find <name<name>> Prints the name and object number of every room, thing, exit, or player that you control whose name (partially) matches <name>.
*    drop <objective<object>>
*    throw <objective<object>>
  Drops the specified object. <object> must be a thing. Can only be used on objects you are carrying. If the current room has the temple flag set, the object will return to its home; if the current room has a dropto set, the object will go the the dropto; otherwise, the item will be placed in the current room. If both flags are set, the object will return to its home. 
*    examine <name<object>> Prints a detailed description of object specified by <name> giving name, description, owner, key, failure message, success message, others failure message, others success message, target, type, password and flags. This is followed by a list of contents (names and types) if there are any. Can only be used on objects you own that are visible to you (in the same room or in your inventory). 
*    get <objective<object>>
*    take <objective<object>> Gets the specified object. <object> must be a thing in the same room as you. 
*    go <direction<object>>
*    goto <direction<object>>
*    move <direction<object>> Moves in the specified direction. **go home** is a special command that returns you to your home (initially the Zepler Foyer). If the direction is unambiguous, the go may be omitted. 
*    inventory Lists what you are carrying. 
*    look <objective<object>>
*    read <objective<object>> <object> can be the name of the current room, or a thing, player, or direction within the current room or in your inventory. Prints a description of <object>. If the object name is omitted, then the current room is assumed. 
*    page <player<object>> Used to inform an active player that you are looking for them. The targeted player will get a message telling them your name and location. 
*    say <message<object>> Display the <message> with the notification that you said it to other players in the same room. For example, if your player’s name is Betty the other players in the same room will see:
```bash
Junming says "<message>"
```

---

## Ordinary commands II  
*    @link <direction> = <room number | here | home>
*    @link <thing> = <room number | here | home>
*    @link <room> = <room number | here | home>  In the first form links the exit of the current room specified by <direction> to the room specified by <room number> or here or home. The exit must be unlinked, and you must own the target room if its link_ok attribute is not set. If you don’t already own the exit its ownership is transferred to you. The second form sets the home for <thing>. If <thing> is me it sets your home. You must own the object and you must own the target room if its link_ok attribute is not set. The third form sets the dropto; see the Dropto's section below for an explanation of dropto’s. You must own the room that the drop is being set on and you must own the target room if its link_ok attribute is not set. 
*    @lock <object>object=key<key> Sets a key (another object) for an object. Both the <object> and <key> must be in the current room or in your inventory. here and me are usable for both keys and objects. You need to own the object your are locking. In order to use <object> you must either be the key, or be carrying the key in your inventory, unless the anti_lock is set (see @set), in which case you must not be carrying the key or be the key. 
*    @name <object> object=name <name> Changes the name of the specified object. This can also be used to specify a new direction list for an exit (see for example @open). 
*    @ofailure <object> [ object=message<message> ] Without a message argument, clears the others failure message on <object>, otherwise sets it. The others failure message, prefixed by the player’s name, is shown to others when the player fails to use <object>. 
*    @open <direction> [ direction;other-dir <other-dir> ]* Creates an unlinked exit in the current room in the specified direction(s). You must own the room in which the exit is being created. Once created, you (or any other player) may use the @link command to specify the room to which the exit leads. See also @name. 
*    @osuccess <object> [ object=message<message> ] Without a message argument, clears the others success message on <object>, otherwise sets it. The others success message, prefixed by the player’s name, is shown to others when the player successfully uses <object>. 
*    @password <old>old=new<new> Sets a new password; you must specify your old password to verify your identity. 
*    @set <object>object=flag<flag>
*    @set <object>object=!flag<flag> Sets (first form) or resets (second form) <flag> on <object>. The current flags are anti_lock, link_ok, and temple. 
*    @success <object> [ object=message<message> ] Without a message argument, clears the success message on <object>, otherwise sets it. The success message is printed when a player successfully uses <object>. Without <message> it clears the success message. 
*    @unlink direction  Removes the link on the exit in the specified <direction>. You must own the exit. The exit may then be relinked by any player using the @link command and ownership of the exit transfers to that player. 
*    @unlock object    Removes the lock on an object. Only the owner can unlock an object. The key does not need to be present to unlock the object. The object needs to be in the same room or in the player's inventory. 
*    look <objective<object>>
*    whisper <player<player>=message<message><object>> <player> is presented with <message> saying that you whispered it. You can only whisper to players in the same room. The other players in the room will normally see the message:
```bash
Betty whispers something to <player>.
```
However, occasionally (with a 1 in 10 probability), another player might instead overhear your whisper and see:
```bash
You overheard Betty whisper "<message>" to <player>.
```

