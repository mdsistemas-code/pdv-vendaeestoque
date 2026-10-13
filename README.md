# Sistema do Depósito de Bebidas

Sistema web para controlar vendas, estoque, fiado, caixa e relatórios de um depósito de bebidas. Funciona no navegador, no computador e no celular, sem precisar instalar nada.

**O que ele faz:** login com usuário e senha; vendas com desconto e troco; pagamento em dinheiro, Pix, cartão de débito ou crédito, ou fiado; comprovante da venda para enviar pelo WhatsApp; cancelamento de venda com devolução ao estoque; caixa do dia separado por forma de pagamento; controle de fiado com recebimento parcial, histórico e extrato para o cliente; gastos e contas a pagar com lucro líquido; produtos com categoria, custo, preço, lucro e estoque mínimo; relatórios com gráficos e exportação para Excel (CSV); backup e restauração.

---

## Estrutura das pastas

```
deposito-bebidas/
├── index.html            Página principal (estrutura das telas)
├── config.js             ← CONFIGURAÇÃO: nome da loja e onde salvar os dados
├── firestore.rules       Regras de segurança (só para o modo Firebase)
├── README.md             Este guia
├── assets/
│   ├── icon.svg          Ícone da aba do navegador
│   └── logo-md-sistemas.png  Logo da tela de entrada
├── css/
│   └── styles.css        Visual (cores, fontes, layout)
└── js/
    ├── utils.js          Formatação de dinheiro e datas, cálculos
    ├── state.js          Estado do sistema e constantes (categorias padrão etc.)
    ├── storage.js        Banco de dados: modo local (navegador) ou Firebase (nuvem)
    ├── ui.js             Avisos, janelas e confirmações
    ├── auth.js           Login, senhas, usuários e código de recuperação
    ├── charts.js         Gráficos (desenhados pelo próprio sistema, em SVG)
    ├── export.js         Download de arquivos e exportação CSV
    ├── share.js          Comprovante de venda e extrato de fiado (WhatsApp, compartilhar, copiar)
    ├── app.js            Inicialização, login e navegação
    └── screens/          Um arquivo por tela
        ├── inicio.js
        ├── venda.js
        ├── vendas.js
        ├── caixa.js
        ├── fiado.js
        ├── produtos.js
        ├── clientes.js
        ├── relatorio.js
        ├── gastos.js
        └── config.js
```

O projeto não tem etapa de compilação: são arquivos HTML, CSS e JavaScript puros. Dá pra editar com qualquer editor (o VS Code é uma boa opção) e publicar do jeito que estão.

---

## Testar no seu computador

Abra o arquivo `index.html` com dois cliques. Ele abre no navegador e já funciona no modo local.

> Os dados criados nesse teste ficam guardados para esse arquivo, nesse navegador. Quando você publicar o site, o endereço muda e ele começa vazio — use **Configurações → Baixar backup** aqui e **Restaurar backup** no site para levar os dados.

---

## Login e senha

**Primeiro acesso.** A tela de entrada tem só o login. Na primeira vez que o sistema abre (quando ainda não existe nenhuma conta), ele já vem com um **acesso inicial**: usuário `admin` e senha `admin`. A própria tela mostra esse aviso enquanto o acesso não for usado. Ao entrar com ele, o sistema pede na hora o **seu nome**, o **usuário ou e-mail** que você vai usar e uma **senha nova** (diferente de `admin`). Depois disso, o acesso `admin`/`admin` deixa de funcionar e você é o administrador. Em seguida, aparece um **código de recuperação**, como `K7M2-Q9TX`. Anote esse código e guarde fora do computador: ele é o que permite criar uma nova senha se você esquecer a atual.

> Quer outro usuário ou senha para o acesso inicial? Troque em `config.js` → `acessoInicial`. Isso só vale para aparelhos que ainda não têm nenhuma conta.

**Já tem conta em outro aparelho?** No modo local, cada computador e navegador guarda os próprios dados. Num aparelho novo (ou depois de publicar o site num endereço novo), entre com `admin` / `admin` e, na tela **Crie o seu acesso**, clique em **Tenho um backup de outro aparelho**. Escolha o arquivo de backup do outro aparelho (**Configurações → Baixar backup** lá) e entre com o mesmo usuário (ou e-mail) e senha de sempre. No modo Firebase isso não é necessário: a conta e os dados ficam na nuvem.

**Usuário ou e-mail.** O login tem um campo só, **Usuário ou e-mail**: o sistema reconhece sozinho o que foi digitado (com "@" é e-mail). Ao criar o acesso, seja na tela **Crie o seu acesso** ou em **Novo usuário**, digite no mesmo campo um nome de usuário (como `ze`) ou um e-mail (como `ze@gmail.com`). Uma conta pode ter os dois: cada pessoa pode cadastrar o próprio e-mail em **Configurações → Cadastrar meu e-mail**, confirmando com a senha, e o administrador pode cadastrar o e-mail dos outros no botão **E-mail** da lista. Depois disso, ela entra com qualquer um dos dois. O e-mail aqui serve só para entrar: no modo local, o sistema não envia mensagens (a senha esquecida continua sendo recuperada pelo código de recuperação).

**Outras pessoas.** Em **Configurações → Usuários e senhas**, um administrador cria um usuário para cada pessoa (por exemplo, quem fica no caixa). As vendas, os recebimentos de fiado, os gastos e as alterações de venda registram quem fez cada coisa.

- **Só o administrador cadastra pessoas.** A tela de entrada não tem opção de criar conta: quem não tem acesso pede ao administrador, que cria em **Novo usuário**.
- Só **administradores** criam e removem usuários, definem uma nova senha para outra pessoa e tornam alguém administrador. Cada pessoa pode trocar a própria senha.
- Não dá para remover o último administrador nem a si mesmo.
- **Manter conectado neste aparelho:** o sistema não pede a senha de novo naquele computador até alguém clicar em **Sair**. Sem essa opção marcada, a sessão termina ao fechar a aba.
- **Esqueci a senha:** na tela de entrada, use o código de recuperação. Se você não tiver o código, outro administrador pode definir uma nova senha para você.
- Depois de 5 senhas erradas seguidas, o sistema espera 30 segundos antes de deixar tentar de novo.

**Sobre a segurança.** A senha nunca é guardada. O sistema guarda só um código embaralhado (hash PBKDF2), que não dá para converter de volta na senha, nem no backup. No **modo local**, o login impede que alguém use o sistema sem senha. Mas os dados ficam no navegador do computador, então quem tiver acesso técnico a ele poderia lê-los por fora do sistema. Para uma proteção de verdade, use o **modo Firebase**: nele o login é do próprio Firebase (usuários criados no console do Firebase, passo 5) e os dados ficam protegidos no servidor. No modo Firebase, as contas são criadas pelo administrador no console do Firebase.

O backup inclui os usuários, com as senhas embaralhadas. **Restaurar** um backup antigo, sem usuários, mantém os usuários atuais. **Apagar todos os dados** também mantém os usuários.

---

## Configurar

Edite o arquivo `config.js`:

```js
nomeDaLoja: 'Depósito do Zé',   // aparece no topo e na aba do navegador
armazenamento: 'local',         // 'local' ou 'firebase'
```

---

## Hospedar num site

Qualquer hospedagem de site estático serve. Três caminhos, do mais simples ao mais completo:

**1. Netlify Drop (mais fácil, grátis).** Entre em <https://app.netlify.com/drop>, crie uma conta e arraste a pasta `deposito-bebidas` para a página. Em segundos você recebe um endereço como `https://nome-aleatorio.netlify.app`. Dá pra trocar o nome nas configurações do site.

**2. GitHub Pages (grátis).** Crie um repositório no GitHub, envie os arquivos desta pasta e ative em *Settings → Pages* (branch `main`, pasta raiz). O endereço fica `https://seu-usuario.github.io/nome-do-repositorio/`.

**3. Hospedagem própria (Hostinger, Locaweb, HostGator etc.).** Envie o conteúdo da pasta para `public_html` pelo gerenciador de arquivos ou por FTP.

> **Não coloque arquivos de backup (`backup-deposito-*.json`) dentro da pasta do site.** Eles têm nomes e telefones de clientes e ficariam públicos na internet.

---

## Onde os dados ficam

### Modo local (padrão)

Os dados ficam no navegador do computador que está usando o sistema, num banco interno (IndexedDB). Não precisa de cadastro nem de internet depois que a página carregou.

Cuidados nesse modo:

- **Cada aparelho e cada navegador tem seus próprios dados.** O que você vende no computador não aparece no celular.
- **Se o navegador for limpo ("limpar dados de navegação") ou o computador der problema, os dados se perdem.** Faça backup com frequência em *Configurações → Baixar backup*. O sistema avisa na tela Início quando o último backup tiver mais de 7 dias.

### Modo nuvem (Firebase)

Os dados ficam online, no Firebase (serviço do Google), e aparecem em qualquer computador ou celular onde você entrar com e-mail e senha. Se a internet cair, o sistema continua registrando vendas no aparelho e envia tudo quando a conexão voltar.

**Passo a passo:**

1. Entre em <https://console.firebase.google.com> com uma conta Google e clique em **Criar projeto**. O Google Analytics pode ficar desativado.
2. No menu **Criação → Firestore Database**, clique em **Criar banco de dados**. Escolha o local `southamerica-east1 (São Paulo)` e o **modo de produção**.
3. Ainda no Firestore, abra a aba **Regras**, apague o que estiver lá, cole o conteúdo do arquivo `firestore.rules` e clique em **Publicar**. Isso garante que só quem fez login consegue ver os dados.
4. No menu **Criação → Authentication**, clique em **Vamos começar**, escolha **E-mail/senha**, ative e salve.
5. Na aba **Users** do Authentication, clique em **Adicionar usuário** e crie um e-mail e senha para cada pessoa que vai usar o sistema.
6. Clique na engrenagem ⚙ → **Configurações do projeto**. Em **Seus apps**, clique no ícone **Web** (`</>`), dê um nome e registre. Copie os valores do `firebaseConfig` que aparecerem.
7. Cole esses valores no `config.js` e troque o armazenamento:

   ```js
   armazenamento: 'firebase',
   firebase: {
     apiKey: 'AIza...',
     authDomain: 'seu-projeto.firebaseapp.com',
     projectId: 'seu-projeto',
     storageBucket: 'seu-projeto.appspot.com',
     messagingSenderId: '123456789',
     appId: '1:123456789:web:abc123'
   }
   ```

8. Em **Authentication → Configurações → Domínios autorizados**, adicione o endereço do seu site (por exemplo `meu-deposito.netlify.app`).
9. Publique o site de novo com o `config.js` atualizado e entre com o e-mail e a senha criados no passo 5.
10. Para levar os dados do modo local: antes de trocar, use **Baixar backup**; depois de entrar no modo Firebase, use **Restaurar backup**.

> As chaves do `firebaseConfig` não são senhas — elas podem ficar no site. Quem protege os dados são as **regras** do passo 3 e o **login**.

**Custos:** o plano gratuito do Firebase (Spark) tem limites diários de leituras e gravações (na data em que este guia foi escrito, cerca de 50 mil leituras e 20 mil gravações por dia) que atendem bem um depósito pequeno. Cada vez que o sistema é aberto ele lê todos os registros, então, com anos de vendas acumuladas e várias pessoas usando, pode ser preciso passar para o plano Blaze (paga só o que passar do limite). Confira os valores atuais em <https://firebase.google.com/pricing>.

---

## Imagem dos produtos

No cadastro ou na edição de um produto, use **Escolher imagem** (no celular, dá para tirar a foto na hora) ou arraste a foto até o quadro. Para tirar a imagem, use **Remover imagem**. A mudança vale quando você clica em **Adicionar produto** ou **Salvar alterações**.

A foto é reduzida automaticamente (até 400 px) e comprimida antes de salvar, então não pesa o sistema. Ela aparece na lista de produtos, onde dá para clicar para ver em tamanho maior, nos cartões da tela de venda e no carrinho. Produtos sem imagem mostram as iniciais do nome. As imagens entram no backup.

---

## Descontos na venda

- **Desconto por item:** no carrinho, clique em **＋ desconto** no produto e escolha **%** ou **R$ por unidade**. O desconto vale para todas as unidades do produto: um item de R$ 10,00 com R$ 1,00 de desconto fica R$ 9,00 cada, e as unidades adicionadas depois já entram com esse preço.
- **Desconto geral:** campo abaixo do subtotal, para abater um valor da venda inteira. Ele é aplicado depois dos descontos nos itens.

Os descontos aparecem no comprovante, nos detalhes da venda e no relatório. O lucro já é calculado com eles.

---

## Editar uma venda já feita

Em **Vendas**, clique na venda e depois em **Editar venda**. Ela volta para o carrinho com os itens, as quantidades, os descontos, a forma de pagamento e o cliente. Altere o que precisar e clique em **Salvar alterações**.

- O estoque é ajustado pela diferença: os itens tirados voltam ao estoque e os novos saem dele.
- Os itens que já estavam na venda mantêm o preço da época, mesmo que o produto tenha mudado de preço depois.
- A venda mantém o número e a data originais. Cada alteração fica registrada nos detalhes, com o total e os itens de antes.
- Se uma venda fiado já recebeu algum pagamento, o tipo e o cliente ficam travados, e o novo total não pode ser menor que o valor já recebido.
- Para desfazer a venda inteira, use **Cancelar venda**.

---

## Gastos

Na tela **Gastos** você lança as despesas do depósito, como aluguel, luz, funcionários e compras na distribuidora:

- **Já paguei:** o gasto entra na data escolhida, com a forma de pagamento. Gastos em dinheiro aparecem no **Caixa do dia** e são descontados do dinheiro da gaveta.
- **Conta a pagar:** fica em aberto até o vencimento. Contas vencidas aparecem em vermelho, com aviso na tela Início e um número no menu. O botão **Pagar** registra o pagamento.

O sistema calcula o **lucro líquido** (lucro das vendas menos os gastos pagos), que aparece na tela Gastos, na Início e no Relatório. As categorias sugeridas ficam em `js/state.js` → `EXPENSE_CATEGORIES`.

---

## Compartilhar venda e extrato de fiado

- Logo depois de finalizar uma venda, à vista ou fiado, aparece o botão **Compartilhar** no aviso. A venda também pode ser compartilhada depois, em **Vendas →** clique na venda **→ Compartilhar**.
- No **Fiado**, o botão **Enviar extrato** monta a lista de compras em aberto do cliente e o total devido. É útil para cobrar.
- Você pode **enviar pelo WhatsApp** (se o cliente tiver telefone cadastrado, o número já vem preenchido), usar o **compartilhar** do celular ou **copiar o texto**.

---

## Backup

Em **Configurações**:

- **Baixar backup** gera um arquivo `.json` com tudo: produtos, clientes, vendas, recebimentos e gastos.
- **Restaurar backup** substitui todos os dados atuais pelos do arquivo. Serve também para passar os dados para outro computador ou para o modo Firebase.
- **Apagar todos os dados** limpa o sistema (útil depois de testar).

As telas **Vendas**, **Caixa do dia**, **Gastos** e **Relatório** também têm **Exportar CSV**, que abre no Excel ou no Google Planilhas.

---

## Personalizar

- **Nome e logo da loja:** dentro do sistema, em **Configurações → Nome e logo do sistema** (só administradores). Dá para trocar o nome, colocar uma imagem no lugar dele e escolher se o nome aparece junto. Fica salvo com os dados e entra no backup. O `config.js` → `nomeDaLoja` é só o nome padrão.
- **Logo da tela de entrada:** troque o arquivo `assets/logo-md-sistemas.png` por outro com o mesmo nome (de preferência PNG com fundo transparente).
- **Cores:** `css/styles.css`, no início do arquivo (`--amber` é a cor principal, `--ink` a cor do texto).
- **Categorias sugeridas no cadastro:** `js/state.js` → `DEFAULT_CATEGORIES`.
- **Cores das formas de pagamento nos gráficos:** `js/state.js` → `METHOD_COLORS`.

---

## Atalhos

- **F2** abre uma nova venda de qualquer tela.
- Na busca da venda, **Enter** adiciona o primeiro produto da lista.
- **Esc** fecha janelas.

---

## No celular

O sistema se ajusta sozinho quando é aberto num celular (ou numa tela estreita):

- **Menu de baixo** com Início, Vendas, **Vender** (botão em destaque), Fiado e **Mais**. O **Mais** abre as outras telas (Caixa, Gastos, Produtos, Clientes, Relatório e Configurações) e o botão **Sair**. Uma bolinha vermelha avisa quando algo lá dentro pede atenção.
- **Barra do carrinho:** durante uma venda, mostra a quantidade de itens e o total, com o botão **Ver carrinho**. Ela também aparece se você sair da tela de venda com itens no carrinho.
- **Produtos em duas colunas** na venda, e carrinho compacto.
- **Tabelas viram cartões**, sem precisar arrastar para os lados.
- **Formulários de cadastro** (produto, cliente e gasto) ficam fechados até você tocar em **＋ Novo**, para a lista aparecer primeiro.
- **Janelas abrem de baixo para cima**, ao alcance do polegar.
- **Campos maiores**, que não fazem o iPhone dar zoom, e **o teclado não abre sozinho**.

**Usar como aplicativo:** no celular, abra o site e escolha **Adicionar à tela inicial** (no iPhone, pelo botão de compartilhar do Safari; no Android, pelo menu do Chrome). O sistema ganha um ícone e abre em tela cheia, como um aplicativo. O ícone e o nome ficam em `manifest.webmanifest` e `assets/icon-*.png`.

---

## Navegadores

Funciona nas versões atuais do Chrome, Edge, Firefox e Safari, no computador e no celular.
