/* state.js
   Estado da aplicação: dados carregados, carrinho, filtros das telas e constantes. */

/* =========================================================
   Estado
   ========================================================= */

const state = { products: [], customers: [], sales: [], payments: [], expenses: [], users: [], settings: [] };
const loaded = { products: false, customers: false, sales: false, payments: false, expenses: false, users: false, settings: false };
let db = null;              // banco de dados (ver storage.js)
let storageMode = 'local';  // 'local' ou 'firebase' (definido em config.js)
let offline = false;        // true se o banco não abriu
let unsubscribers = [];
let cart = {};              // { idProduto: quantidade }
let cartDiscounts = {};     // desconto por item: { idProduto: { type: 'pct' | 'valor', value: n } }
let editingSaleId = null;   // venda sendo editada (null = venda nova)
let cartPrices = {};        // na edição: preço e custo originais de cada item { idProduto: { price, cost } }
let editOriginalQty = {};   // na edição: quantidades originais (voltam ao estoque disponível)
let currentScreen = 'inicio';
const charts = {};
let pendingWrites = 0;
let renderQueued = false;
let savingSale = false;

const ui = {
  vendaCat: 'Todas', vendaSearch: '',
  saleType: 'avista', pm: 'dinheiro', cardType: 'debito',
  selectCustomerId: null,
  prodCat: 'Todas', prodSearch: '', editingProductId: null,
  custSearch: '', editingCustomerId: null,
  vendasPeriod: '7', vendasMethod: 'todas', vendasSearch: '', vendasShowCanceled: false, vendasLimit: 50,
  caixaDate: dayKey(new Date()),
  reportPeriod: '30',
  gastosPeriod: 'mes', gastosCat: 'Todas', gastosStatus: 'todos', gastosSearch: '', editingExpenseId: null,
  expStatus: 'pago', expMethod: 'dinheiro'
};

const DEFAULT_CATEGORIES = ['Água','Cerveja','Destilados','Energético','Gelo','Outros','Refrigerante','Suco','Vinho'];
const SCREEN_TITLES = { inicio:'Início', venda:'Nova venda', vendas:'Vendas', caixa:'Caixa do dia', fiado:'Fiado', produtos:'Produtos', clientes:'Clientes', relatorio:'Relatório', gastos:'Gastos', config:'Configurações' };
const METHOD_LABELS = { dinheiro:'Dinheiro', pix:'Pix', cartao_debito:'Cartão débito', cartao_credito:'Cartão crédito', fiado:'Fiado', nao_informado:'Não informado' };
const METHOD_COLORS = { dinheiro:'#3F8A63', pix:'#2E8C99', cartao_debito:'#C8872E', cartao_credito:'#7A5AA8', fiado:'#B14A32', nao_informado:'#A4AEA8' };
const PAY_METHODS = ['dinheiro','pix','cartao_debito','cartao_credito'];
const CAT_PALETTE = ['#C8872E','#3F8A63','#2E8C99','#7A5AA8','#B14A32','#8C7B3E','#4F7CAC','#C46A8A','#5C6B73','#A4AEA8'];
// Gastos (despesas)
const EXPENSE_CATEGORIES = ['Água e luz','Aluguel','Combustível e frete','Compra de mercadoria','Embalagens','Funcionários','Impostos e taxas','Internet e telefone','Manutenção','Outros'];
const EXPENSE_METHODS = { dinheiro:'Dinheiro', pix:'Pix', cartao_debito:'Cartão débito', cartao_credito:'Cartão crédito', boleto:'Boleto', transferencia:'Transferência' };
const EXPENSE_STATUS = [['todos','Todos'],['pago','Pagos'],['apagar','A pagar'],['vencido','Vencidos']];

const PERIODS = [['hoje','Hoje'],['7','7 dias'],['30','30 dias'],['mes','Este mês'],['mes_passado','Mês passado'],['tudo','Tudo']];
