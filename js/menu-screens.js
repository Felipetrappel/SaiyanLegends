/* Telas iniciais (versão 1) do menu principal: LOJA, MISSÕES, RANKING, EVENTOS e PASSE.
 * São telas simples e navegáveis (com botão Voltar); o conteúdo é de exemplo e ainda NÃO tem lógica real
 * (sem moedas, sem progresso salvo, sem ranking online). Para ligar a lógica, troque os dados em DATA por chamadas reais. */
(() => {
'use strict';
const S = SaiyanMenu.screens, el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const DATA = {
  missions: [['Vença 3 partidas', 0, 3], ['Use o poder de Ki 20 vezes', 0, 20], ['Voe por 60 segundos', 0, 60], ['Derrote 5 oponentes', 0, 5]],
  events: [['Torneio Saiyan', 'Em breve'], ['Fim de semana de XP em dobro', 'Em breve'], ['Invasão do Vilão', 'Em breve']],
  pass: [['Nível 1', 'Aura azul'], ['Nível 5', 'Moldura de retrato'], ['Nível 10', 'Personagem exclusivo'], ['Nível 20', 'Aura dourada']],
  shop: [['Personagens', 'Escolha e compre heróis na tela PERSONAGEM'], ['Auras', 'Em breve'], ['Cristais', 'Em breve'], ['Pacotes', 'Em breve']]
};
const list = items => { const ul = el('ul', 'mlist'); items.forEach(f => ul.append(f)); return ul; };
const item = (title, sub, soon, pct) => { const li = el('li'); li.append(el('b', '', { textContent: title })); if (soon) li.firstChild.append(el('span', 'soon', { textContent: soon })); if (sub) li.append(el('span', '', { textContent: sub })); if (pct !== undefined) li.append(el('div', 'mbar', { innerHTML: `<i style="width:${pct}%"></i>` })); return li; };
const screen = (title, intro, body, extra) => ({ title, build(p) {
  p.classList.add('wide'); p.append(el('h2', '', { textContent: title }), el('p', '', { textContent: intro }), body());
  const row = el('div', 'row'); if (extra) row.append(...extra); row.append(S.btn('Voltar', () => S.close(), true)); p.append(row);
} });
S.register('shop', screen('Loja', 'Itens para evoluir seu herói. (Versão inicial)', () => list(DATA.shop.map(([t, s]) => item(t, s))), [S.btn('Ir para Personagens', () => S.open('store'))]));
S.register('missions', screen('Missões', 'Complete missões para ganhar recompensas. (Versão inicial: o progresso ainda não é salvo)', () => list(DATA.missions.map(([t, v, m]) => item(t, v + ' / ' + m, '', v / m * 100)))));
S.register('rankings', screen('Ranking', 'Classificação dos jogadores. (Versão inicial: o ranking online ainda não existe)', () => list([item('Nenhum jogador classificado ainda', 'As vitórias online vão aparecer aqui.')])));
S.register('events', screen('Eventos', 'Eventos especiais do jogo. (Versão inicial)', () => list(DATA.events.map(([t, s]) => item(t, '', s)))));
S.register('pass', screen('Passe', 'Recompensas por nível do passe. (Versão inicial: ainda não há níveis nem progresso)', () => list(DATA.pass.map(([t, s]) => item(t, s, 'Bloqueado')))));
})();
