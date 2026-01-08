import { DOM_ELEMENTS, showAlert } from "../utils/dom-helpers.js";

// Estado local do módulo
let parsedData = [];
let unitName = "NÃO IDENTIFICADO";

/**
 * Inicializa o módulo do Leitor de Requisição
 */
export function initLeitorRequisicao() {
    // Listener para abrir o modal
    if (DOM_ELEMENTS.btnImportarRequisicao) {
        DOM_ELEMENTS.btnImportarRequisicao.addEventListener('click', () => {
            if (DOM_ELEMENTS.modalLeitorRequisicao) {
                resetLeitor(); // Limpa estado anterior
                DOM_ELEMENTS.modalLeitorRequisicao.style.display = 'flex';
            }
        });
    }

    // Listeners de Drag & Drop
    const dropZone = DOM_ELEMENTS.leitorDropZone;
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => { 
            e.preventDefault(); 
            dropZone.style.borderColor = '#2563eb'; 
            dropZone.style.background = '#eff6ff'; 
        });
        dropZone.addEventListener('dragleave', () => { 
            dropZone.style.borderColor = '#94a3b8'; 
            dropZone.style.background = '#f8fafc'; 
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#94a3b8'; 
            dropZone.style.background = '#f8fafc';
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
    }

    // Listener de Input de Arquivo
    const fileInput = DOM_ELEMENTS.leitorFileInput;
    if (fileInput) {
        fileInput.addEventListener('change', (e) => { 
            if (e.target.files.length) handleFile(e.target.files[0]); 
        });
    }

    // Listener de Ações
    if (DOM_ELEMENTS.btnConfirmarImportacao) {
        DOM_ELEMENTS.btnConfirmarImportacao.addEventListener('click', exportToForm);
    }
    
    if (DOM_ELEMENTS.btnLeitorVoltar) {
        DOM_ELEMENTS.btnLeitorVoltar.addEventListener('click', resetLeitor);
    }
}

/**
 * Reseta o estado do leitor e da UI
 */
function resetLeitor() {
    parsedData = [];
    unitName = "NÃO IDENTIFICADO";
    
    // Reseta visualização
    if (document.getElementById('leitor-upload-section')) document.getElementById('leitor-upload-section').classList.remove('hidden');
    if (document.getElementById('leitor-loading-section')) document.getElementById('leitor-loading-section').classList.add('hidden');
    if (DOM_ELEMENTS.leitorPreviewSection) DOM_ELEMENTS.leitorPreviewSection.classList.add('hidden');
    
    if (DOM_ELEMENTS.leitorFileInput) DOM_ELEMENTS.leitorFileInput.value = '';
}

/**
 * Processa o arquivo recebido
 */
function handleFile(file) {
    const uploadSection = document.getElementById('leitor-upload-section');
    const loadingSection = document.getElementById('leitor-loading-section');
    
    if (uploadSection) uploadSection.classList.add('hidden');
    if (loadingSection) loadingSection.classList.remove('hidden');
    
    const fileName = file.name;
    const ext = fileName.split('.').pop().toLowerCase();
    
    console.log("Arquivo recebido:", fileName, "Extensão:", ext);

    setTimeout(() => {
        try {
            if (['csv', 'txt'].includes(ext)) {
                processCSV(file);
            } 
            else if (['xlsx', 'xls', 'ods', 'xlsb', 'xlsm', 'xml'].includes(ext)) {
                processExcel(file);
            } 
            else if (['docx'].includes(ext)) {
                processWord(file);
            } 
            else if (['pdf'].includes(ext)) {
                alert("Arquivo PDF detectado.\n\nPara garantir a precisão, este sistema recomenda a conversão do PDF para Excel ou Word.\n\nTentaremos ler se for texto selecionável, mas o layout pode quebrar.");
                resetLeitor();
            }
            else {
                console.warn("Extensão desconhecida, tentando motor Excel...");
                processExcel(file);
            }
        } catch (e) {
            alert("Erro ao iniciar processamento: " + e.message);
            resetLeitor();
        }
    }, 500);
}

// --- MOTORES DE PROCESSAMENTO ---

function processCSV(file) {
    Papa.parse(file, {
        complete: function(results) {
            analyzeData(results.data);
        },
        error: function(err) {
            alert("Erro CSV: " + err.message);
            resetLeitor();
        }
    });
}

function processExcel(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, {header: 1, defval: ""});
            analyzeData(rows);
        } catch (err) {
            console.error(err);
            alert("Erro ao ler Planilha: " + err.message);
            resetLeitor();
        }
    };
    reader.readAsArrayBuffer(file);
}

function processWord(file) {
    if (typeof mammoth === 'undefined') {
        alert("Erro: Biblioteca de Word não carregou. Verifique sua conexão.");
        resetLeitor();
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const arrayBuffer = event.target.result;
        mammoth.convertToHtml({arrayBuffer: arrayBuffer})
            .then(function(result) {
                const html = result.value;
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = html;
                
                let allRows = [];
                
                // Captura parágrafos (títulos soltos) e tabelas
                tempDiv.childNodes.forEach(node => {
                    if (node.nodeName === 'P' || node.nodeName === 'H1' || node.nodeName === 'H2' || node.nodeName === 'H3') {
                        allRows.push([node.innerText]);
                    } else if (node.nodeName === 'TABLE') {
                        for (let tr of node.rows) {
                            let rowData = [];
                            for (let td of tr.cells) {
                                rowData.push(td.innerText);
                            }
                            allRows.push(rowData);
                        }
                    }
                });

                // Busca unidade no texto bruto se não achar na tabela
                const fullText = tempDiv.innerText.toUpperCase();
                if (fullText.includes("NOME DA UNIDADE")) {
                    const match = fullText.match(/NOME DA UNIDADE[:\s]+([^\n]+)/);
                    if (match) unitName = match[1].trim();
                }

                analyzeData(allRows);
            })
            .catch(function(err) {
                alert("Erro ao ler Word: " + err.message);
                resetLeitor();
            });
    };
    reader.readAsArrayBuffer(file);
}

// --- LÓGICA DE ANÁLISE ---

function analyzeData(rows) {
    try {
        parsedData = [];
        if (!unitName || unitName === "NÃO IDENTIFICADO") unitName = "Unidade Não Identificada";
        
        let foundHeader = false;
        let idxMat = -1, idxUnd = -1, idxSol = -1;

        rows.forEach((row, index) => {
            if (!Array.isArray(row)) return;
            
            const rowStr = row.map(c => String(c || "").toUpperCase()).join(' ');
            
            // 1. Identificar Unidade
            if (rowStr.includes("NOME DA UNIDADE")) {
                const cell = row.find(c => String(c).toUpperCase().includes("NOME DA UNIDADE"));
                if (cell) {
                    unitName = String(cell).replace(/NOME DA UNIDADE/i, '').replace(/[:]/g, '').replace(/[\",]/g, '').trim();
                }
            }

            // 2. Identificação de Cabeçalho
            if (!foundHeader) {
                row.forEach((cell, i) => {
                    const c = String(cell || "").toUpperCase().trim();
                    if (c === 'MATERIAL') idxMat = i;
                    if (c === 'UNIDADE') idxUnd = i;
                    if (c.includes('SOLICITADA') || c.includes('QTD') || c.includes('QUANTIDADE')) idxSol = i;
                });

                if (idxMat > -1) { // Flexibilizando: se achou Material, já é um bom sinal
                    foundHeader = true;
                    // Se não achou colunas específicas, tenta inferir: 0=Material, 1=Unidade, 2=Qtd
                    if (idxSol === -1) idxSol = idxMat + 2; 
                    return; 
                }
            }

            // 3. Extração de Dados
            if (foundHeader || index > 5) { // Se passou 5 linhas e não achou header, tenta ler assim mesmo se parecer item
                const material = row[idxMat] ? String(row[idxMat]).trim() : '';
                const unidade = idxUnd > -1 && row[idxUnd] ? String(row[idxUnd]).trim() : '';
                const qtd = idxSol > -1 && row[idxSol] ? String(row[idxSol]).trim() : '';

                // Filtra linhas inválidas ou cabeçalhos repetidos
                if (!material || material.toUpperCase() === 'MATERIAL' || material.includes('SEPARADO POR')) return;

                parsedData.push({
                    material,
                    unidade,
                    qtd
                });
            }
        });

        showPreview();

    } catch (e) {
        console.error(e);
        alert("Erro na análise dos dados: " + e.message);
        resetLeitor();
    }
}

function showPreview() {
    const loadingSection = document.getElementById('leitor-loading-section');
    const previewSection = DOM_ELEMENTS.leitorPreviewSection;
    const tbody = DOM_ELEMENTS.leitorPreviewTable;
    const unitDisplay = DOM_ELEMENTS.leitorPreviewUnidade;
    const countDisplay = DOM_ELEMENTS.leitorPreviewCount;

    if (loadingSection) loadingSection.classList.add('hidden');
    if (previewSection) previewSection.classList.remove('hidden');

    if (unitDisplay) unitDisplay.textContent = unitName;
    if (countDisplay) countDisplay.textContent = parsedData.length;

    if (tbody) {
        tbody.innerHTML = '';
        
        if (parsedData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4">Nenhum item identificado.</td></tr>';
            return;
        }

        parsedData.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-4 py-2 border-b">${item.material}</td>
                <td class="px-4 py-2 border-b text-center">${item.qtd}</td>
                <td class="px-4 py-2 border-b text-center">${item.unidade || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function exportToForm() {
    if (parsedData.length === 0) {
        alert("Não há dados para importar.");
        return;
    }

    // 1. Tentar preencher a Unidade
    const selectUnidade = DOM_ELEMENTS.selectUnidadeMateriais;
    let unidadeEncontrada = false;
    
    if (unitName && unitName !== "Unidade Não Identificada" && selectUnidade) {
        // Normaliza para busca (remove acentos, uppercase)
        const term = unitName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        
        for (let i = 0; i < selectUnidade.options.length; i++) {
            const optText = selectUnidade.options[i].text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            if (optText.includes(term) || term.includes(optText)) {
                selectUnidade.selectedIndex = i;
                unidadeEncontrada = true;
                break;
            }
        }
    }

    // 2. Preencher a Textarea
    const textarea = DOM_ELEMENTS.textareaItensMateriais;
    if (textarea) {
        const lines = parsedData.map(item => {
            let line = `- ${item.material}`;
            if (item.qtd) line += ` (${item.qtd}`;
            if (item.unidade) line += ` ${item.unidade}`;
            if (item.qtd) line += `)`;
            return line;
        });
        
        textarea.value = lines.join('\n');
    }

    // 3. Feedback e Fechamento
    let msg = `Importação concluída! ${parsedData.length} itens preenchidos.`;
    if (!unidadeEncontrada && unitName !== "Unidade Não Identificada") {
        msg += `\n\nAtenção: A unidade "${unitName}" não foi encontrada automaticamente na lista. Por favor, selecione manualmente.`;
    }
    
    if (typeof showAlert === 'function') {
        showAlert('alert-materiais', msg, unidadeEncontrada ? 'success' : 'warning');
    } else {
        alert(msg);
    }

    if (DOM_ELEMENTS.modalLeitorRequisicao) {
        DOM_ELEMENTS.modalLeitorRequisicao.style.display = 'none';
    }
    
    // Rola para o formulário
    const form = document.getElementById('subview-lancar-materiais');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
}
