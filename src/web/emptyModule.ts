// Resolves native-only modules (react-native-udp) to a socket-less stub on web; discovery treats a null socket as "unavailable".
const emptyModule = { createSocket: () => null };

export default emptyModule;
