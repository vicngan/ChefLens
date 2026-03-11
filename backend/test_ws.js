import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
    console.log('Connected to backend WebSocket. Waiting for backend to initialize Gemini...');

    setTimeout(() => {
        console.log('Sending text query...');
        ws.send(JSON.stringify({
            type: 'clientContent',
            text: 'Hello ChefLens! This is a test.'
        }));
    }, 3000);
});

ws.on('message', (data) => {
    const msg = JSON.parse(Array.isArray(data) ? Buffer.concat(data).toString() : data.toString());
    
    if (msg.type === 'cc') {
        console.log('Received generation chunk:', msg.text);
    } else {
        console.log('Received other:', msg.type);
    }
});

ws.on('error', (err) => console.error('WS Error:', err));
ws.on('close', () => console.log('Connection closed.'));

setTimeout(() => {
    console.log('Done waiting.');
    ws.close();
    process.exit(0);
}, 6000);
