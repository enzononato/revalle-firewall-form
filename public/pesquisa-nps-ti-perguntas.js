/* Pesquisa de NPS do TI — definicao unica das etapas, perguntas e regras.
 *
 * Usada pela pagina publica (monta o passo a passo), pelo servidor
 * (valida o envio) e pelo painel (rotulos, graficos e CSV). Alterar aqui
 * muda os tres de uma vez.
 *
 * Tipos: 'unica' (uma opcao), 'multi' (varias; `exclusiva` desmarca as
 * demais), 'escala' (0-10), 'matriz' (nota 1-5 ou "Nao uso" por item),
 * 'aberta' (texto livre).
 * `mostrar(r)` recebe as respostas ja dadas e decide se a pergunta aparece.
 * Perguntas escondidas nao sao validadas e nao sao gravadas.
 *
 * A pergunta 'nps' nao deve mudar entre edicoes, para comparar a evolucao.
 */
(function (root) {
  const temComputador = (r) => (r.equipamentos || []).some((e) => e === 'desktop' || e === 'notebook');
  const temCelular = (r) => (r.equipamentos || []).includes('celular');
  const temImpressora = (r) => (r.equipamentos || []).includes('impressora');
  // As perguntas "ajudaria?" so aparecem depois que a pessoa marca algo.
  const marcouEquipamentos = (r) => Array.isArray(r.equipamentos) && r.equipamentos.length > 0;

  const NOTAS_1_5 = [
    { v: '1', l: '1 · Muito ruim' },
    { v: '2', l: '2 · Ruim' },
    { v: '3', l: '3 · Regular' },
    { v: '4', l: '4 · Bom' },
    { v: '5', l: '5 · Ótimo' },
  ];

  const perguntas = [
    /* ── Etapa 1 · Seus equipamentos ── */
    {
      id: 'equipamentos', etapa: 'equipamentos', ref: '10/15', tipo: 'multi', exclusiva: 'nenhum',
      texto: 'Quais destes equipamentos você usa no trabalho?',
      ajuda: 'Marque todos que você usa. As próximas perguntas se adaptam ao que você marcar.',
      opcoes: [
        { v: 'celular', l: 'Celular corporativo' },
        { v: 'desktop', l: 'Computador desktop' },
        { v: 'notebook', l: 'Notebook' },
        { v: 'impressora', l: 'Impressora' },
        { v: 'nenhum', l: 'Não uso nenhum desses' },
      ],
    },
    {
      id: 'computador_ajudaria', etapa: 'equipamentos', ref: '10', tipo: 'unica',
      texto: 'Um computador ajudaria no seu trabalho?',
      mostrar: (r) => marcouEquipamentos(r) && !temComputador(r),
      opcoes: [
        { v: 'ajudaria', l: 'Sim, ajudaria' },
        { v: 'nao_preciso', l: 'Não preciso' },
      ],
    },
    {
      id: 'celular_ajudaria', etapa: 'equipamentos', ref: '15.1', tipo: 'unica',
      texto: 'Um celular corporativo ajudaria no seu trabalho?',
      mostrar: (r) => marcouEquipamentos(r) && !temCelular(r),
      opcoes: [
        { v: 'ajudaria_muito', l: 'Sim, ajudaria muito' },
        { v: 'ajudaria_pouco', l: 'Ajudaria um pouco' },
        { v: 'nao_preciso', l: 'Não preciso' },
      ],
    },

    /* ── Etapa 2 · Avaliação geral ── */
    {
      id: 'nps', etapa: 'geral', ref: '2', tipo: 'escala', obrigatoria: true, min: 0, max: 10,
      texto: 'De 0 a 10, o quanto você indicaria o suporte de TI a um colega?',
      rotuloMin: 'Não indicaria', rotuloMax: 'Indicaria com certeza',
    },
    {
      id: 'notas_areas', etapa: 'geral', ref: '3', tipo: 'matriz', obrigatoria: true,
      texto: 'Como você avalia cada item na sua revenda?',
      ajuda: '1 = muito ruim, 5 = ótimo. Use "Não uso" se o item não faz parte do seu dia a dia.',
      notas: NOTAS_1_5,
      itens: [
        { id: 'atendimento', l: 'Atendimento dos chamados' },
        { id: 'presenca', l: 'Presença do TI na revenda' },
        { id: 'computadores', l: 'Computadores e equipamentos', mostrar: temComputador },
        { id: 'impressora', l: 'Impressora', mostrar: temImpressora },
        { id: 'telefonia', l: 'Telefonia', mostrar: temCelular },
        { id: 'internet', l: 'Internet na revenda' },
        { id: 'dados_moveis', l: 'Dados móveis', mostrar: temCelular },
      ],
    },
    {
      id: 'motivo_notas', etapa: 'geral', ref: '4', tipo: 'aberta', obrigatoria: true, min: 4,
      texto: 'O que fez você dar essas notas?',
    },

    /* ── Etapa 3 · Atendimento e presença ── */
    {
      id: 'ultimo_atendimento', etapa: 'atendimento', ref: '5', tipo: 'unica',
      texto: 'Pensando na última vez que precisou do TI, como foi?',
      opcoes: [
        { v: 'rapido', l: 'Resolveram rápido' },
        { v: 'demorou', l: 'Resolveram, mas levou um tempo' },
        { v: 'aguardando', l: 'Ainda estou aguardando' },
        { v: 'nao_precisei', l: 'Não precisei recentemente' },
      ],
    },
    {
      id: 'facilidade_ajuda', etapa: 'atendimento', ref: '6', tipo: 'unica',
      texto: 'Quando você precisa do TI, consegue encontrar ajuda com facilidade?',
      opcoes: [
        { v: 'sempre', l: 'Sim, sempre' },
        { v: 'maioria', l: 'Na maioria das vezes' },
        { v: 'as_vezes', l: 'Às vezes' },
        { v: 'dificuldade', l: 'Tenho dificuldade' },
      ],
    },
    {
      id: 'avalia_chamado', etapa: 'atendimento', ref: '7', tipo: 'unica',
      texto: 'Quando seu chamado é encerrado, você costuma responder a avaliação?',
      opcoes: [
        { v: 'sempre', l: 'Sempre' },
        { v: 'as_vezes', l: 'Às vezes' },
        { v: 'quase_nunca', l: 'Quase nunca' },
        { v: 'nao_sabia', l: 'Não sabia que dava para avaliar' },
      ],
    },
    {
      id: 'motivo_nao_avalia', etapa: 'atendimento', ref: '8', tipo: 'unica',
      texto: 'O que faz você não responder a avaliação?',
      mostrar: (r) => Boolean(r.avalia_chamado) && r.avalia_chamado !== 'sempre',
      opcoes: [
        { v: 'nao_recebo', l: 'Não recebo o pedido' },
        { v: 'esqueco', l: 'Esqueço' },
        { v: 'demora', l: 'Leva muito tempo' },
        { v: 'nao_muda', l: 'Acho que não muda nada' },
        { v: 'outro', l: 'Outro' },
      ],
    },
    {
      id: 'melhoria', etapa: 'atendimento', ref: '9', tipo: 'aberta',
      texto: 'Se pudesse pedir uma melhoria ao TI, qual seria?',
    },

    /* ── Etapa 4 · Computador e internet ── */
    {
      id: 'computador_da_conta', etapa: 'computador', ref: '11', tipo: 'unica', mostrar: temComputador,
      texto: 'O computador dá conta do que você precisa fazer?',
      opcoes: [
        { v: 'bem', l: 'Dá conta bem' },
        { v: 'lento_as_vezes', l: 'Dá conta, mas às vezes fica lento' },
        { v: 'dificuldade', l: 'Tenho dificuldade com o que preciso' },
      ],
    },
    {
      id: 'computador_trava', etapa: 'computador', ref: '12', tipo: 'unica', mostrar: temComputador,
      texto: 'Com que frequência ele fica lento ou trava?',
      opcoes: [
        { v: 'quase_nunca', l: 'Quase nunca' },
        { v: 'mes', l: 'Algumas vezes por mês' },
        { v: 'semana', l: 'Algumas vezes por semana' },
        { v: 'todo_dia', l: 'Quase todo dia' },
      ],
    },
    {
      id: 'computador_atrapalha', etapa: 'computador', ref: '13', tipo: 'multi', exclusiva: 'nada', mostrar: temComputador,
      texto: 'O que mais atrapalha seu trabalho no computador?',
      ajuda: 'Pode marcar mais de uma.',
      opcoes: [
        { v: 'demora_ligar', l: 'Demora para ligar' },
        { v: 'sistemas_lentos', l: 'Sistemas lentos' },
        { v: 'office', l: 'Office e arquivos' },
        { v: 'impressora', l: 'Impressora' },
        { v: 'internet', l: 'Internet instável' },
        { v: 'nada', l: 'Nada atrapalha' },
      ],
    },
    {
      id: 'internet_revenda', etapa: 'computador', ref: '14', tipo: 'unica',
      texto: 'A internet funciona bem na revenda?',
      opcoes: [
        { v: 'sempre', l: 'Funciona sempre' },
        { v: 'oscila_as_vezes', l: 'Oscila de vez em quando' },
        { v: 'oscila_frequente', l: 'Oscila com frequência' },
        { v: 'fora_frequente', l: 'Fica fora com frequência' },
        { v: 'nao_uso', l: 'Não uso a internet da revenda' },
      ],
    },

    /* ── Etapa 5 · Celular corporativo (so quem tem) ── */
    {
      id: 'celular_atm', etapa: 'celular', ref: '16', tipo: 'unica', mostrar: temCelular,
      texto: 'Seu celular corporativo é da ATM?',
      opcoes: [
        { v: 'sim', l: 'Sim' },
        { v: 'nao', l: 'Não' },
        { v: 'nao_sei', l: 'Não sei' },
      ],
    },
    {
      id: 'celular_recorre', etapa: 'celular', ref: '17', tipo: 'unica', mostrar: temCelular,
      texto: 'Quando o celular dá problema, a quem você recorre?',
      opcoes: [
        { v: 'ti_revenda', l: 'Ao TI da revenda' },
        { v: 'atm', l: 'Direto à ATM' },
        { v: 'gestor', l: 'Ao meu gestor' },
        { v: 'nao_sei', l: 'Não sei a quem recorrer' },
      ],
    },
    {
      id: 'precisou_atm', etapa: 'celular', ref: '18', tipo: 'unica', mostrar: temCelular,
      texto: 'Você já precisou do suporte da ATM?',
      opcoes: [
        { v: 'sim', l: 'Sim' },
        { v: 'nao', l: 'Não' },
      ],
    },
    {
      id: 'nota_atm', etapa: 'celular', ref: '18.1', tipo: 'unica',
      mostrar: (r) => temCelular(r) && r.precisou_atm === 'sim',
      texto: 'De 1 a 5, como você avalia o suporte da ATM?',
      opcoes: NOTAS_1_5,
    },
    {
      id: 'ultima_atm', etapa: 'celular', ref: '18.2', tipo: 'unica',
      mostrar: (r) => temCelular(r) && r.precisou_atm === 'sim',
      texto: 'Na última vez que precisou da ATM, como foi?',
      opcoes: [
        { v: 'rapido', l: 'Resolveram rápido' },
        { v: 'demorou', l: 'Resolveram, mas demorou' },
        { v: 'nao_resolveram', l: 'Não resolveram' },
        { v: 'aguardando', l: 'Ainda estou aguardando' },
      ],
    },
    {
      id: 'opiniao_atm', etapa: 'celular', ref: '18.3', tipo: 'aberta',
      mostrar: (r) => temCelular(r) && r.precisou_atm === 'sim',
      texto: 'O que você acha do suporte da ATM?',
    },
    {
      id: 'estado_aparelho', etapa: 'celular', ref: '19', tipo: 'multi', exclusiva: 'bom', mostrar: temCelular,
      texto: 'Como está o estado do aparelho?',
      ajuda: 'Pode marcar mais de um problema.',
      opcoes: [
        { v: 'bom', l: 'Bom estado' },
        { v: 'tela_carcaca', l: 'Tela ou carcaça danificada' },
        { v: 'bateria', l: 'Bateria viciada ou estufada' },
        { v: 'carregar_botao_camera', l: 'Problema para carregar, no botão ou na câmera' },
      ],
    },
    {
      id: 'tempo_aparelho', etapa: 'celular', ref: '20', tipo: 'unica', mostrar: temCelular,
      texto: 'Há quanto tempo você usa esse aparelho?',
      opcoes: [
        { v: 'menos_1', l: 'Menos de 1 ano' },
        { v: '1_2', l: 'De 1 a 2 anos' },
        { v: 'mais_2', l: 'Mais de 2 anos' },
        { v: 'nao_sei', l: 'Não sei' },
      ],
    },
    {
      id: 'bateria', etapa: 'celular', ref: '21', tipo: 'unica', mostrar: temCelular,
      texto: 'A bateria do celular corporativo aguenta a sua jornada?',
      opcoes: [
        { v: 'aguenta', l: 'Aguenta a jornada toda' },
        { v: 'no_limite', l: 'Chega ao fim no limite' },
        { v: 'carrega_durante', l: 'Preciso carregar durante a jornada' },
        { v: 'poucas_horas', l: 'Descarrega em poucas horas' },
      ],
    },
    {
      id: 'aplicativos', etapa: 'celular', ref: '22', tipo: 'unica', mostrar: temCelular,
      texto: 'Os aplicativos de trabalho funcionam bem no aparelho?',
      opcoes: [
        { v: 'bem', l: 'Funcionam bem' },
        { v: 'as_vezes_travam', l: 'Às vezes travam ou fecham' },
        { v: 'travam_frequente', l: 'Travam com frequência' },
      ],
    },
    {
      id: 'dados_moveis', etapa: 'celular', ref: '23', tipo: 'unica', mostrar: temCelular,
      texto: 'Os dados móveis do chip corporativo atendem o seu trabalho?',
      opcoes: [
        { v: 'atendem', l: 'Atendem bem' },
        { v: 'acabam', l: 'Acabam antes do fim do mês' },
        { v: 'lenta', l: 'Conexão lenta ou instável' },
        { v: 'sem_dados', l: 'O chip não tem dados' },
      ],
    },
    {
      id: 'ligacoes', etapa: 'celular', ref: '24', tipo: 'unica', mostrar: temCelular,
      texto: 'As ligações pelo celular corporativo funcionam bem?',
      opcoes: [
        { v: 'bem', l: 'Funcionam bem' },
        { v: 'as_vezes_caem', l: 'Às vezes caem ou ficam ruins' },
        { v: 'caem_frequente', l: 'Caem com frequência' },
        { v: 'nao_faco', l: 'Não faço ligações' },
      ],
    },
    {
      id: 'sinal', etapa: 'celular', ref: '25', tipo: 'unica', mostrar: temCelular,
      texto: 'Como é o sinal onde você trabalha ou na sua rota?',
      opcoes: [
        { v: 'bom', l: 'Bom em todo lugar' },
        { v: 'fraco_alguns', l: 'Fraco em alguns pontos' },
        { v: 'sem_sinal_varios', l: 'Sem sinal em vários pontos' },
      ],
    },
    {
      id: 'locais_sem_sinal', etapa: 'celular', ref: '26', tipo: 'aberta',
      mostrar: (r) => temCelular(r) && Boolean(r.sinal) && r.sinal !== 'bom',
      texto: 'Quais são os lugares com sinal fraco ou sem sinal?',
      ajuda: 'Cidade, rota, cliente ou setor.',
    },
    {
      id: 'falta_acessorio', etapa: 'celular', ref: '27', tipo: 'multi', exclusiva: 'nada', mostrar: temCelular,
      texto: 'Falta algo para usar o celular no trabalho?',
      ajuda: 'Pode marcar mais de um.',
      opcoes: [
        { v: 'carregador', l: 'Carregador' },
        { v: 'carregador_veicular', l: 'Carregador veicular' },
        { v: 'suporte_veicular', l: 'Suporte veicular' },
        { v: 'capa_pelicula', l: 'Capa ou película' },
        { v: 'nada', l: 'Nada falta' },
      ],
    },
  ];

  // Toda pergunta de marcar e obrigatoria quando aparece; as abertas sao
  // opcionais. `obrigatoria` explicito na pergunta abre excecao.
  for (const p of perguntas) {
    if (p.obrigatoria === undefined) p.obrigatoria = p.tipo !== 'aberta';
  }

  const etapas = [
    { id: 'equipamentos', titulo: 'Seus equipamentos', descricao: 'Primeiro, conte o que você usa no dia a dia.' },
    { id: 'geral', titulo: 'Avaliação geral', descricao: 'Sua nota para o suporte de TI.' },
    { id: 'atendimento', titulo: 'Atendimento e presença', descricao: 'Como é quando você precisa do TI.' },
    { id: 'computador', titulo: 'Computador e internet', descricao: 'Como estão as máquinas e a internet.' },
    { id: 'celular', titulo: 'Celular corporativo', descricao: 'Aparelho, linha e suporte da ATM.' },
  ];

  const MAX_TEXTO = 1500;
  const visivel = (p, r) => !p.mostrar || p.mostrar(r);
  const itensVisiveis = (p, r) => p.itens.filter((it) => !it.mostrar || it.mostrar(r));
  const etapaTemPerguntas = (etapaId, r) => perguntas.some((p) => p.etapa === etapaId && visivel(p, r));

  // Valida e limpa as respostas de uma etapa (ou de todas, se etapaId vazio).
  // Retorna { erros: {perguntaId: msg}, limpas: {...} } — limpas so tem
  // perguntas visiveis, com valores dentro das opcoes.
  function validar(respostas, etapaId) {
    const r = respostas || {};
    const erros = {};
    const limpas = {};
    for (const p of perguntas) {
      if (etapaId && p.etapa !== etapaId) continue;
      if (!visivel(p, r)) continue;
      const v = r[p.id];

      if (p.tipo === 'unica') {
        if (v == null || v === '') { if (p.obrigatoria) erros[p.id] = 'Escolha uma opção.'; continue; }
        if (!p.opcoes.some((o) => o.v === v)) { erros[p.id] = 'Opção inválida.'; continue; }
        limpas[p.id] = v;
      } else if (p.tipo === 'multi') {
        const arr = Array.isArray(v) ? [...new Set(v)] : [];
        if (!arr.length) { if (p.obrigatoria) erros[p.id] = 'Marque ao menos uma opção.'; continue; }
        if (!arr.every((x) => p.opcoes.some((o) => o.v === x))) { erros[p.id] = 'Opção inválida.'; continue; }
        if (p.exclusiva && arr.includes(p.exclusiva) && arr.length > 1) { erros[p.id] = 'Combinação inválida.'; continue; }
        limpas[p.id] = arr;
      } else if (p.tipo === 'escala') {
        const n = Number(v);
        if (v == null || v === '' || !Number.isInteger(n) || n < p.min || n > p.max) {
          if (p.obrigatoria || (v != null && v !== '')) erros[p.id] = `Escolha uma nota de ${p.min} a ${p.max}.`;
          continue;
        }
        limpas[p.id] = n;
      } else if (p.tipo === 'matriz') {
        const obj = v && typeof v === 'object' ? v : {};
        const out = {};
        const faltando = [];
        for (const it of itensVisiveis(p, r)) {
          const nota = obj[it.id];
          if (nota === 'nao_uso' || p.notas.some((o) => o.v === String(nota))) out[it.id] = nota === 'nao_uso' ? 'nao_uso' : String(nota);
          else faltando.push(it.l);
        }
        if (faltando.length && p.obrigatoria) { erros[p.id] = `Dê uma nota para: ${faltando.join(', ')}.`; continue; }
        limpas[p.id] = out;
      } else if (p.tipo === 'aberta') {
        const t = String(v || '').trim().slice(0, MAX_TEXTO);
        if (!t) { if (p.obrigatoria) erros[p.id] = 'Escreva sua resposta.'; continue; }
        if (p.min && t.length < p.min) { erros[p.id] = `Escreva pelo menos ${p.min} caracteres.`; continue; }
        limpas[p.id] = t;
      }
    }
    return { erros, limpas };
  }

  // Texto legivel de uma resposta (painel e CSV).
  function rotulo(p, v) {
    if (v == null || v === '') return '';
    if (p.tipo === 'unica') return (p.opcoes.find((o) => o.v === v) || {}).l || String(v);
    if (p.tipo === 'multi') return (Array.isArray(v) ? v : []).map((x) => (p.opcoes.find((o) => o.v === x) || {}).l || x).join('; ');
    if (p.tipo === 'matriz') {
      return p.itens.filter((it) => v[it.id] != null)
        .map((it) => `${it.l}: ${v[it.id] === 'nao_uso' ? 'Não uso' : v[it.id]}`).join('; ');
    }
    return String(v);
  }

  // NPS = % promotores (9-10) - % detratores (0-6).
  function calcularNps(notas) {
    const total = notas.length;
    if (!total) return { total: 0, nps: null, promotores: 0, neutros: 0, detratores: 0 };
    const promotores = notas.filter((n) => n >= 9).length;
    const detratores = notas.filter((n) => n <= 6).length;
    const pct = (x) => Math.round((x / total) * 1000) / 10;
    return {
      total,
      nps: Math.round(((promotores - detratores) / total) * 1000) / 10,
      promotores, neutros: total - promotores - detratores, detratores,
      pct_promotores: pct(promotores), pct_neutros: pct(total - promotores - detratores), pct_detratores: pct(detratores),
    };
  }

  const def = {
    versao: 1,
    titulo: 'Pesquisa de NPS do TI',
    abertura: 'Queremos ouvir você para melhorar as ferramentas e o suporte de TI. Leva uns 3 minutos.',
    etapas, perguntas, MAX_TEXTO,
    temComputador, temCelular, temImpressora,
    visivel, itensVisiveis, etapaTemPerguntas, validar, rotulo, calcularNps,
    porId: Object.fromEntries(perguntas.map((p) => [p.id, p])),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else root.PESQUISA_NPS_TI = def;
})(typeof window !== 'undefined' ? window : globalThis);
