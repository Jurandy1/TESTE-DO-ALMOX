import { DOM_ELEMENTS, showAlert } from "../utils/dom-helpers.js";
import { getMateriais, getUnidades } from "../utils/cache.js";
import { formatTimestamp } from "../utils/formatters.js";

let chartItens = null;
let chartUnidades = null;

export function initHistoricoGeral() {
    if (DOM_ELEMENTS.btnGerarRelatorioGeral) {
        DOM_ELEMENTS.btnGerarRelatorioGeral.addEventListener('click', renderHistoricoGeral);
    }
    
    // Opcional: Atualizar ao mudar filtros (sem clicar no botão)
    // if (DOM_ELEMENTS.filtroHistGeralPeriodo) DOM_ELEMENTS.filtroHistGeralPeriodo.addEventListener('change', renderHistoricoGeral);
}

export function renderHistoricoGeral() {
    // Verificar se a view está visível
    if (!DOM_ELEMENTS.subviewHistoricoGeral || DOM_ELEMENTS.subviewHistoricoGeral.classList.contains('hidden')) {
        return;
    }

    console.log("Renderizando Histórico Geral...");
    
    // Popular filtro de unidades se estiver vazio (exceto 'todas')
    if (DOM_ELEMENTS.filtroHistGeralUnidade && DOM_ELEMENTS.filtroHistGeralUnidade.options.length <= 1) {
        const unidades = getUnidades();
        unidades.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.nome; // Usando nome para filtrar pois o registro salva nome e id
            opt.textContent = u.nome;
            DOM_ELEMENTS.filtroHistGeralUnidade.appendChild(opt);
        });
    }

    const materiais = getMateriais();
    if (!materiais || materiais.length === 0) {
        if (DOM_ELEMENTS.tableHistoricoGeral) {
            DOM_ELEMENTS.tableHistoricoGeral.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">Nenhum dado encontrado.</td></tr>';
        }
        return;
    }

    // Filtros
    const periodoDias = parseInt(DOM_ELEMENTS.filtroHistGeralPeriodo.value) || 30;
    const unidadeFiltro = DOM_ELEMENTS.filtroHistGeralUnidade.value;
    const categoriaFiltro = DOM_ELEMENTS.filtroHistGeralCategoria.value;

    const dataLimite = new Date();
    if (periodoDias !== 'todo') {
        dataLimite.setDate(dataLimite.getDate() - periodoDias);
    } else {
        dataLimite.setFullYear(1900); // Data muito antiga
    }

    const dadosFiltrados = materiais.filter(m => {
        // Filtro de Data
        let dataRef = null;
        if (m.dataRequisicao) {
            dataRef = m.dataRequisicao.toDate ? m.dataRequisicao.toDate() : new Date(m.dataRequisicao);
        } else if (m.registradoEm) {
            dataRef = m.registradoEm.toDate ? m.registradoEm.toDate() : new Date(m.registradoEm);
        }
        
        if (!dataRef || dataRef < dataLimite) return false;

        // Filtro de Unidade
        if (unidadeFiltro !== 'todas' && m.unidadeNome !== unidadeFiltro) return false;

        // Filtro de Categoria
        if (categoriaFiltro !== 'todas' && m.tipoMaterial !== categoriaFiltro) return false;

        return true;
    });

    processarDadosEAtualizarUI(dadosFiltrados);
}

function processarDadosEAtualizarUI(dados) {
    // Estruturas para agregação
    const itensCount = {};
    const unidadesCount = {};
    const tabelaItens = {}; // Chave: Nome do Item -> { qtd: 0, unidades: Set, ultimaSaida: timestamp }

    dados.forEach(reg => {
        // Contagem por Unidade
        const nomeUnidade = reg.unidadeNome || 'Desconhecida';
        unidadesCount[nomeUnidade] = (unidadesCount[nomeUnidade] || 0) + 1;

        // Processar Itens (Texto Bruto)
        const linhas = (reg.itens || "").split('\n');
        linhas.forEach(linha => {
            let itemNome = linha.trim();
            if (!itemNome) return;

            // Tenta limpar marcadores comuns
            itemNome = itemNome.replace(/^-\s*/, '').replace(/^\*\s*/, '');
            
            // Tenta extrair quantidade se estiver no formato "Item (5)" ou "Item (5 un)"
            let qtd = 1;
            const match = itemNome.match(/(.*?)\s*\((\d+)/);
            if (match) {
                itemNome = match[1].trim();
                qtd = parseInt(match[2]) || 1;
            }

            if (!itemNome) return;

            // Normalizar nome (Title Case simples)
            itemNome = itemNome.charAt(0).toUpperCase() + itemNome.slice(1).toLowerCase();

            // Agregação para Gráfico Top Itens
            itensCount[itemNome] = (itensCount[itemNome] || 0) + qtd;

            // Agregação para Tabela Detalhada
            if (!tabelaItens[itemNome]) {
                tabelaItens[itemNome] = {
                    qtdTotal: 0,
                    unidades: new Set(),
                    ultimaSaida: null
                };
            }
            tabelaItens[itemNome].qtdTotal += qtd;
            tabelaItens[itemNome].unidades.add(nomeUnidade);
            
            const dataReg = reg.registradoEm ? (reg.registradoEm.toDate ? reg.registradoEm.toDate() : new Date(reg.registradoEm)) : null;
            if (dataReg) {
                if (!tabelaItens[itemNome].ultimaSaida || dataReg > tabelaItens[itemNome].ultimaSaida) {
                    tabelaItens[itemNome].ultimaSaida = dataReg;
                }
            }
        });
    });

    atualizarGraficos(itensCount, unidadesCount);
    atualizarTabela(tabelaItens);
}

function atualizarGraficos(itensCount, unidadesCount) {
    if (typeof Chart === 'undefined') return;

    // 1. Gráfico de Itens Mais Requisitados (Top 10)
    const sortedItens = Object.entries(itensCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    const ctxItens = DOM_ELEMENTS.chartItensMaisReq ? DOM_ELEMENTS.chartItensMaisReq.getContext('2d') : null;
    if (ctxItens) {
        if (chartItens) chartItens.destroy();
        chartItens = new Chart(ctxItens, {
            type: 'bar',
            data: {
                labels: sortedItens.map(([k]) => k),
                datasets: [{
                    label: 'Quantidade Requisitada',
                    data: sortedItens.map(([,v]) => v),
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // Barra horizontal para caber nomes longos
                plugins: { legend: { display: false } }
            }
        });
    }

    // 2. Gráfico de Requisições por Unidade (Top 10)
    const sortedUnidades = Object.entries(unidadesCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const ctxUnidades = DOM_ELEMENTS.chartReqPorUnidade ? DOM_ELEMENTS.chartReqPorUnidade.getContext('2d') : null;
    if (ctxUnidades) {
        if (chartUnidades) chartUnidades.destroy();
        chartUnidades = new Chart(ctxUnidades, {
            type: 'doughnut',
            data: {
                labels: sortedUnidades.map(([k]) => k),
                datasets: [{
                    data: sortedUnidades.map(([,v]) => v),
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#64748b'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 10 } }
                }
            }
        });
    }
}

function atualizarTabela(tabelaItens) {
    const tbody = DOM_ELEMENTS.tableHistoricoGeral;
    if (!tbody) return;

    tbody.innerHTML = '';

    const sortedRows = Object.entries(tabelaItens).sort(([,a], [,b]) => b.qtdTotal - a.qtdTotal);

    if (sortedRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Nenhum item encontrado no período.</td></tr>';
        return;
    }

    sortedRows.forEach(([nome, dados]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-2 border-b font-medium text-gray-700">${nome}</td>
            <td class="px-4 py-2 border-b text-center">${dados.qtdTotal}</td>
            <td class="px-4 py-2 border-b text-center">
                <span title="${Array.from(dados.unidades).join(', ')}">${dados.unidades.size}</span>
            </td>
            <td class="px-4 py-2 border-b text-center text-gray-500 text-xs">
                ${dados.ultimaSaida ? formatTimestamp({toDate: ()=>dados.ultimaSaida}) : '-'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}
