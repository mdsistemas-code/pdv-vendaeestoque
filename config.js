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
  armazenamento: 'firebase',

  // Acesso inicial: usado só na primeira vez que o sistema é aberto (quando ainda não há contas).
  // Depois de entrar com ele, o sistema pede para criar o seu próprio usuário e senha,
  // e este acesso deixa de funcionar.
  acessoInicial: {
    usuario: 'admin',
    senha: 'admin'
  },

  // Chaves do Firebase (só usadas quando armazenamento = 'firebase')
  firebase: {
    apiKey: 'AIzaSyCHGHXqy0GDuYbpkqufdxk-db3V47cQ_-M',
    authDomain: 'mdsistemas-68d26.firebaseapp.com',
    projectId: 'mdsistemas-68d26',
    storageBucket: 'mdsistemas-68d26.firebasestorage.app',
    messagingSenderId: '126212598586',
    appId: '1:126212598586:web:3ce038a1d1a9ddef127e03'
  }
};
