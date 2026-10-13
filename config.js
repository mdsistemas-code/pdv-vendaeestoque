/* =========================================================
   CONFIGURAÇÃO DO SISTEMA
   Este é o único arquivo que você precisa editar.
   ========================================================= */
window.APP_CONFIG = {

  // Nome padrão no topo do sistema e na aba do navegador.
  // Dá para trocar o nome e colocar uma logo dentro do sistema: Configurações → Nome e logo do sistema.
  nomeDaLoja: 'Depósito',

  // Onde os dados ficam salvos:
  //   'local'    → no navegador deste computador (funciona na hora, sem cadastro)
  //   'firebase' → na nuvem, com login, para usar em vários computadores e celulares
  //                (preencha as chaves abaixo — passo a passo no README.md)
  armazenamento: 'local',

  // Chaves do Firebase (só usadas quando armazenamento = 'firebase')
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  }
};
