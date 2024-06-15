const { on } = require('events');

// Websocket server for handling key presses and releases
const PORT = 8443;
const http = require('http').createServer();
const io = require('socket.io')(http, {
    cors: { origin: '*' }
});

/*--------------------*/
/*   Game functions   */
/*--------------------*/

// Collision detection
function collides(a, b) {
    return a.position.x < b.position.x + b.width &&
           a.position.x + a.width > b.position.x &&
           a.position.y < b.position.y + b.height &&
           a.position.y + a.height > b.position.y;
}
// Collision detection with array
function collidesWithAny(a, b) {
    for (const element of b) {
        if (collides(a, element)) {
            return true;
        }
    }
    return false;
}
// Update player velocity
function updateVelocity(player) {
    // Walk handling
    if (player.pressedKeys.left != player.pressedKeys.right) {  
        if (player.pressedKeys.left) {
            if (player.moveVelos.x > -maxSpeeds.walk) {
                player.moveVelos.x -= moveVeloConsts.walk.x;
            } else {
                player.moveVelos.x = -maxSpeeds.walk;
            }
        }
        if (player.pressedKeys.right) {
            if (player.moveVelos.x < maxSpeeds.walk) {
                player.moveVelos.x += moveVeloConsts.walk.x;
            } else {
                player.moveVelos.x = maxSpeeds.walk;
            }
        }
    } else {
        if (Math.abs(player.moveVelos.x) < 0.1) {
            player.moveVelos.x = 0;
        } else {
            player.moveVelos.x /= 3;
        }
    }

    // Fall handling
    const onWall = player.isOnWall();
    // Player is running against a wall
    if (((onWall == -1 || onWall == 2) && player.pressedKeys.left) ||
        ((onWall == 1 || onWall == 2) && player.pressedKeys.right)) {
        // Jumping against wall
        if (player.moveVelos.y < 0) {
                player.moveVelos.y += moveVeloConsts.gravity.y;
        } else {
                // Wall slide acceleration
                if (player.moveVelos.y < maxSpeeds.wallSlide) {
                    player.moveVelos.y += moveVeloConsts.wallSlideAcceleration.y;
                } else {
                    player.moveVelos.y = maxSpeeds.wallSlide;
                }
        }
    } else {
        // Gravity handling
        player.moveVelos.y += moveVeloConsts.gravity.y;
        if (player.moveVelos.y > maxSpeeds.fall) {
            player.moveVelos.y = maxSpeeds.fall;
        }
    }
    
    player.rechargeJumps();

    // Jump handling
    if (player.pressedKeys.jump) {
        player.jump();
    }
}
// Fix out of bounds player position
function fixOutOfBounds(player) {
    const x = player.hitbox.position.x;
    const y = player.hitbox.position.y;
    const width = player.hitbox.width;
    const height = player.hitbox.height;

    if (x > 480+width) {
        player.position.x = -width;
    }
    if (y > 270+height) {
        player.position.y = -height;
    }
    if (x < -width) {
        player.position.x = 480+width;
    }
    if (y < -height) {
        player.position.y = 270+height;
    }
}
// Update player position
function updatePosition(player) {
    updateVelocity(player);

    const solids = obstacles.filter(obstacle => !obstacle.isPassable);
    let steps = Math.max(Math.abs(player.moveVelos.x), Math.abs(player.moveVelos.y));
    
    moveInSteps(player, steps, solids)
}
// Move player in steps for accurate collision detection
function moveInSteps(player, steps, solids) {
    for (let i = 0; i < steps; i++) {
        let oldPosition = { x: player.position.x, y: player.position.y };
        
        player.position.x += player.moveVelos.x / steps;
        if (collidesWithAny(player.hitbox, solids)) {
            player.position.x = oldPosition.x;
            player.moveVelos.x = 0;
        } else {
            fixOutOfBounds(player);
        }

        player.position.y += player.moveVelos.y / steps;
        if (collidesWithAny(player.hitbox, solids)) {
            player.position.y = oldPosition.y;
            player.moveVelos.y = 0;
        } else {
            fixOutOfBounds(player);
        }
    }
}

/*--------------------*/
/*   Game constants   */
/*--------------------*/

const colors = ['blue', 'red', 'green', 'yellow', 'purple', 'orange'];
const wallCheckTolerance = 7;
const groundCheckTolerance = 5;
const moveVeloConsts = {
    jump:       { x:  0,    y: -12 },
    gravity:    { x:  0,    y:   1.5 },
    walk:       { x:  6,    y:   0 },
    wallSlideAcceleration:  { x:  0,    y:   .5 },
    wallJump:   { x:  10,    y: -10 }
};
const maxSpeeds = {
    fall:      25,
    walk:       8,
    wallSlide:  2.5,
};

/*------------------*/
/*   Game classes   */
/*------------------*/

class Hitbox {
    constructor({
        position = { x: 0, y: 0 },
        color = 'white',
        width = 0,
        height = 0
    }) {
        this.position = position;
        this.color = color;
        this.width = width;
        this.height = height;
    }
}

class Sprite {
    constructor({
        position = { x: 0, y: 0 },
        color,
        spriteFileLoc = '../null.png',
    }) {
        this.position = position;
        this.color = color;
        this.spriteFileLoc = spriteFileLoc;
    }
    draw() {
        // Draw sprite
    }
}

class Fighter {
    constructor({
        characterType,
        position = { x: 0, y: 0 },
        hitboxColor = 'white',
        hitboxWidth = 24,
        hitboxHeight = 48
    }) {
        
        this.characterType = characterType;
        this.position = position;
        this.pressedKeys = {
            space: false,
            up: false,
            left: false,
            down: false,
            right: false,
            jump: false
        };
        this.hitbox = new Hitbox({
            position: this.position,
            color: hitboxColor,
            width: hitboxWidth,
            height: hitboxHeight
        });

        this.moveVelos = {
            x: 0,
            y: 0
        };
        this.performedJumps = 0;
        this.max_jumps = 2;
    }

    jump() {
        if (this.performedJumps < this.max_jumps) {
            if (this.isOnWall() != 0) {
                this.moveVelos.x = moveVeloConsts.wallJump.x * this.isOnWall();
            }
            this.moveVelos.y = moveVeloConsts.jump.y;
            this.performedJumps += 1;
            this.pressedKeys.jump = false; // Prevents holding space to jump higher
        }
    }

    isGrounded() {
        let potentialGrounds = obstacles.filter(obstacle => !obstacle.isPassable);
        let groundCheck = {
            position: { x: this.hitbox.position.x, y: this.hitbox.position.y + this.hitbox.height-wallCheckTolerance },
            width: this.hitbox.width,
            height: wallCheckTolerance*2
        };
        return collidesWithAny(groundCheck, potentialGrounds);
    }

    isOnWall() {
        // -1 = left, 0 = none, 1 = right, 2 = both
        let onWall = 0;
        let potentialWalls = obstacles.filter(obstacle => !obstacle.isPassable);

        let leftHitbox = {
            position: { x: this.hitbox.position.x - wallCheckTolerance, y: this.hitbox.position.y },
            width: wallCheckTolerance*2,
            height: this.hitbox.height
        };
        let rightHitbox = {
            position: { x: this.hitbox.position.x + this.hitbox.width, y: this.hitbox.position.y },
            width: wallCheckTolerance*2,
            height: this.hitbox.height
        };

        if (collidesWithAny(leftHitbox, potentialWalls)) {
            onWall = -1;
        }
        if (collidesWithAny(rightHitbox, potentialWalls)) {
            onWall = onWall == -1 ? 2 : 1;
        }

        return onWall;
    }

    rechargeJumps() {
        if (this.isGrounded() || this.isOnWall() != 0){
            this.performedJumps = 0;
        }
    }
}
class Obstacle extends Hitbox{
    constructor({
        position = { x: 0, y: 0 },
        color,
        width = 280,
        height = 20,
        isPassable = false
    }) {
        super({
            position, 
            color,
            width,
            height
        });

        this.isPassable = isPassable;
    }
}

// Game variables
let sockets = [];
let players = [];
let obstacles = [
    new Obstacle({
        position: { x: 100, y: 200 },
        color: 'black',
    }),
    new Obstacle({
        position: { x: 220, y: 100 },
        color: 'black',
        width: 20,
        height: 100
    }),
    new Obstacle({
        position: { x: 440, y: -50 },
        color: 'black',
        width: 20,
        height: 400
    }),
];

/*-------------------------*/
/*   Connection handling   */
/*-------------------------*/

// Handle incoming connections
io.on('connection', (socket) => {
    console.log('A user connected');
    sockets[socket.id] = socket;
    players[socket.id] = new Fighter({
        characterType: 'Nerd',
        position: { x: 100, y: 0 },
        hitboxColor: colors[Math.floor(Math.random() * colors.length)]
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log('A user disconnected');
        delete sockets[socket.id];
        delete players[socket.id];
    });
    
    
    // Handle incoming key presses
    socket.on('keyPressUpdate', (pressedKeys) => {
        players[socket.id].pressedKeys = pressedKeys;
    });

});

/*---------------*/
/*   Game loop   */
/*---------------*/

setInterval(() => {
    const pack = [];
    const playerData = [];
    const mapData = [];

    // Update player physics
    for (const player of Object.values(players)) {
        updatePosition(player);

        // Saving relevant player data
        playerData.push({
            x: player.position.x,
            y: player.position.y,
            color: player.hitbox.color,
            hitbox: player.hitbox
        });
    }

    for (const obstacle of obstacles) {
        mapData.push({
            x: obstacle.position.x,
            y: obstacle.position.y,
            color: obstacle.color,
            width: obstacle.width,
            height: obstacle.height
        });
    }

    for (const socket of Object.values(sockets)) {
        socket.emit('update', { players: playerData, map: mapData});
    }
}, 1000/60);

/*---------------------*/
/*   Starting Server   */
/*---------------------*/

http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});