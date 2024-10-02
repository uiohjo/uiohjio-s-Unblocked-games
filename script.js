document.addEventListener('DOMContentLoaded', () => {
    const games = document.querySelectorAll('.game-list a');
    const randomGame = games[Math.floor(Math.random() * games.length)];
    console.log(`Random game suggestion: ${randomGame.textContent}`);
});

