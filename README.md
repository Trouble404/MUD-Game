#MCU-Javascript

**nodejs-Javascript application**

**Available in [main page](https://comp3207-cw1-1718-jz1g17.herokuapp.com/)**

---

## Ordinary commands 
*    @create <name<name>> Creates a thing with the specified name. The thing will belong to you and be placed in your inventory. By default it will have it’s home set to your home. 
*    @descibe <object<player>=descibtion<message><object>> <object> can be a room, thing, player, or direction that is in the same room as you, or in your inventory. Sets the description a player sees when they use the command look <object>. If <object> is here it sets the description for the current room that is displayed when the room is entered. If <object> is me it sets the description for your character. You can only set the description of an object you own. 
*    @dig <name<name>> Creates a new room with the specified name, and prints the room’s number. 
*    @create <name<name>>
*    @create <name<name>>
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
*    look <objective<object>>
*    whisper <player<player>=message<message><object>> <player> is presented with <message> saying that you whispered it. You can only whisper to players in the same room. The other players in the room will normally see the message:
```bash
Betty whispers something to <player>.
```
However, occasionally (with a 1 in 10 probability), another player might instead overhear your whisper and see:
```bash
You overheard Betty whisper "<message>" to <player>.
```
  































