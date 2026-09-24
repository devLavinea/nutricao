import ExcelJS from "exceljs";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  ChangeEvent,
  FormEvent,
  ReactNode,
  Dispatch,
  SetStateAction,
} from "react";

import { firebaseDb } from "./lib/firebase";


const imagemPlanilha = "/Imagem-planilha.png";
const prefeituraLogo = "/prefeitura.png";

type Perfil =
  | "secretaria"
  | "professor"
  | "cozinha"
  | "erica";

type Tela =
  | "inicio"
  | "cozinha"
  | "professor"
  | "secretaria"
  | "planilhas";

type Refeicao =
  | "Desjejum"
  | "Lanche da manhã"
  | "Almoço"
  | "Lanche da tarde"
  | "Jantar";

type Grupo = string;

type Cardapio = {
  id: number;
  refeicao: Refeicao;
  preparacao: string;
};

type RegistroCozinha = {
  id: number;
  data: string;
  grupo: Grupo;
  refeicao: Refeicao;
  servida: string;
  horario: string;
  registradoPor: string;
  foto?: string;
};

type Avaliacao = {
  id: number;
  registroId: number;
  data: string;
  grupo: Grupo;
  refeicao: Refeicao;
  preparacao: string;
  alunos: number;
  gostaram: number;
  naoGostaram: number;
  nomeResponsavel: string;
  cargoResponsavel: string;
  foto?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const REFEICOES: Refeicao[] = [
  "Desjejum",
  "Lanche da manhã",
  "Almoço",
  "Lanche da tarde",
  "Jantar",
];

const REGISTROS_INICIAIS: RegistroCozinha[] = [];

const AVALIACOES_INICIAIS: Avaliacao[] = [];

type SessaoPersistida = {
  perfil: Perfil;
  funcionarioLogado: {
    id: number;
    nome: string;
    login: string;
    grupo: string;
    cargo: string;
  };
};

const CHAVE_SESSAO = "alimentacao_escolar_sessao";

function obterSessaoPersistida(): SessaoPersistida | null {
  if (typeof window === "undefined") return null;

  try {
    const sessao = localStorage.getItem(CHAVE_SESSAO);
    if (!sessao) return null;

    return JSON.parse(sessao) as SessaoPersistida;
  } catch {
    localStorage.removeItem(CHAVE_SESSAO);
    return null;
  }
}

/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */

function obterDataHoje(): string {
  const agora = new Date();

  const ano = agora.getFullYear();

  const mes = String(
    agora.getMonth() + 1
  ).padStart(2, "0");

  const dia = String(
    agora.getDate()
  ).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function normalizarData(
  data: unknown
): string {
  if (!data) return "";

  return String(data)
    .trim()
    .substring(0, 10);
}

/**
 * Normaliza texto para comparação.
 *
 * Exemplo:
 * "Lanche da Manhã"
 * "lanche da manhã"
 * " LANCHE DA MANHÃ "
 *
 * passam a ser considerados iguais.
 */
function normalizarFoto(valor: unknown): string | undefined {
  if (valor == null) return undefined;

  // Aceita valores que venham como objeto do Firebase/Storage.
  if (typeof valor === "object") {
    const objeto = valor as any;
    valor = objeto.url ?? objeto.publicUrl ?? objeto.public_url ?? objeto.data ?? objeto.base64;
  }

  let foto = String(valor ?? "").trim();
  if (!foto || foto === "null" || foto === "undefined") return undefined;

  // Remove aspas extras quando o banco armazenou a string como JSON.
  if ((foto.startsWith('"') && foto.endsWith('"')) || (foto.startsWith("'") && foto.endsWith("'"))) {
    foto = foto.slice(1, -1).trim();
  }

  if (foto.startsWith("data:image/")) return foto;
  if (foto.startsWith("http://") || foto.startsWith("https://") || foto.startsWith("blob:")) return foto;

  // Base64 sem prefixo: transforma em Data URL exibível pelo navegador.
  const base64 = foto.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.length > 100) {
    return `data:image/jpeg;base64,${base64}`;
  }

  return foto;
}

function normalizarTexto(
  valor: unknown
): string {
  return String(valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Converte o valor vindo do banco para
 * uma das refeições aceitas pelo sistema.
 */
function nomeExibicao(nome: string): string {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  return partes.slice(0, 2).join(" ") || "Não informado";
}

function normalizarRefeicao(
  valor: unknown
): Refeicao | "" {
  const normalizado =
    normalizarTexto(valor);

  const encontrada =
    REFEICOES.find(
      (refeicao) =>
        normalizarTexto(
          refeicao
        ) === normalizado
    );

  return encontrada ?? "";
}

function formatarDataBR(
  data: string
): string {
  if (!data) return "";

  const dataNormalizada =
    normalizarData(data);

  const partes =
    dataNormalizada.split("-");

  if (partes.length !== 3) {
    return data;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function obterHorarioAtual(): string {
  const agora = new Date();

  return agora.toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

/* =========================================================
   APP PRINCIPAL
========================================================= */

function App() {
  const sessaoInicial = obterSessaoPersistida();

  const [logado, setLogado] =
    useState(Boolean(sessaoInicial));

  const [perfil, setPerfil] =
    useState<Perfil | null>(sessaoInicial?.perfil ?? null);

  const [tela, setTela] =
    useState<Tela>(
      sessaoInicial?.perfil === "cozinha"
        ? "cozinha"
        : sessaoInicial?.perfil === "professor" || sessaoInicial?.perfil === "erica"
          ? "professor"
          : "inicio"
    );

  const [usuario, setUsuario] =
    useState("");

  const [senha, setSenha] =
    useState("");

  const [
    registrosCozinha,
    setRegistrosCozinha,
  ] = useState<RegistroCozinha[]>(
    REGISTROS_INICIAIS
  );

  const [
    avaliacoes,
    setAvaliacoes,
  ] = useState<Avaliacao[]>(
    AVALIACOES_INICIAIS
  );

  const [
    cardapio,
    setCardapio,
  ] = useState<Cardapio[]>([]);

  const [grupos, setGrupos] = useState<Grupo[]>([]);

  /* =========================================================
     CARREGAR REGISTROS DE REFEIÇÕES DO FIREBASE
  ========================================================= */

  useEffect(() => {
    let ativo = true;

    async function carregarRegistrosRefeicoes() {
      if (!logado) return;
      const { data, error } = await firebaseDb
        .from("registro_refeicoes")
        .select("id, data, grupo, refeicao, servida, horario, registrado_por")
        .order("data", { ascending: false })
        .order("id", { ascending: false });

      if (!ativo) return;

      if (error) {
        console.error("ERRO AO CARREGAR REGISTROS DE REFEIÇÕES:", error);
        return;
      }

      const registrosNormalizados: RegistroCozinha[] = (data ?? []).map(
        (item: any) => ({
          id: Number(item.id),
          data: normalizarData(item.data),
          grupo: String(item.grupo ?? "").trim(),
          refeicao: normalizarRefeicao(item.refeicao) || ("Almoço" as Refeicao),
          servida: String(item.servida ?? "").trim(),
          horario: String(item.horario ?? "").trim(),
          registradoPor: String(item.registrado_por ?? "").trim(),
          foto: undefined,
        })
      );

      setRegistrosCozinha(registrosNormalizados);
    }

    carregarRegistrosRefeicoes();

    return () => {
      ativo = false;
    };
  }, [logado]);

  const [
    carregandoCardapio,
    setCarregandoCardapio,
  ] = useState(true);

  const [
    erroCardapio,
    setErroCardapio,
  ] = useState("");

  const [
    installPrompt,
    setInstallPrompt,
  ] =
    useState<BeforeInstallPromptEvent | null>(
      null
    );

  const [
    appInstalado,
    setAppInstalado,
  ] = useState(() => {
    return (
      localStorage.getItem(
        "app_instalado"
      ) === "sim"
    );
  });

  const [
    notificacoesAtivas,
    setNotificacoesAtivas,
  ] = useState(() => {
    return (
      localStorage.getItem(
        "notificacoes_ativas"
      ) === "sim"
    );
  });

  const [
    mensagemLogin,
    setMensagemLogin,
  ] = useState("");

  const [
    funcionarioLogado,
    setFuncionarioLogado,
  ] = useState<{
    id: number;
    nome: string;
    login: string;
    grupo: string;
    cargo: string;
  } | null>(sessaoInicial?.funcionarioLogado ?? null);

  /* =========================================================
     CARREGAR GRUPOS DO FIREBASE
  ========================================================= */

  useEffect(() => {
    let ativo = true;

    async function carregarGrupos() {
      if (!logado) return;
      const { data, error } = await firebaseDb
        .from("grupos")
        .select("nome, grupo");

      if (!ativo) return;

      if (error) {
        console.error("ERRO AO CARREGAR GRUPOS:", error);
        setGrupos([]);
        return;
      }

      const gruposNormalizados = (data ?? [])
        .map((item: any) => String(item.nome ?? item.grupo ?? item.name ?? "").trim())
        .filter(Boolean);

      setGrupos(Array.from(new Set(gruposNormalizados)));
    }

    carregarGrupos();

    return () => { ativo = false; };
  }, [logado]);

  /* =========================================================
     CARREGAR CARDÁPIO DO FIREBASE
  ========================================================= */

  useEffect(() => {
    let ativo = true;

    async function carregarCardapio() {
      if (!logado) return;
      setCarregandoCardapio(true);
      setErroCardapio("");

      try {

        const {
          data,
          error,
        } = await firebaseDb
          .from("cardapio")
          .select("id, refeicao, preparacao")
          .order("id", {
            ascending: true,
          });

        if (!ativo) return;

        if (error) {
          console.error(
            "ERRO FIREBASE AO CARREGAR CARDÁPIO:",
            error
          );

          setErroCardapio(
            `Erro ao carregar cardápio: ${error.message}`
          );

          setCardapio([]);

          return;
        }

        if (!data) {
          setCardapio([]);

          setErroCardapio(
            "O Firebase não retornou dados."
          );

          return;
        }

        const dadosNormalizados: Cardapio[] =
          data
            .map(
              (
                item: any
              ): Cardapio | null => {
                const refeicao =
                  normalizarRefeicao(
                    item.refeicao
                  );

                const preparacao =
                  String(
                    item.preparacao ??
                      ""
                  ).trim();

                if (!refeicao || !preparacao) {
                  return null;
                }

                return {
                  id: Number(item.id),
                  refeicao,
                  preparacao,
                };
              }
            )
            .filter((item) => item !== null) as Cardapio[];

        setCardapio(
          dadosNormalizados
        );

        if (
          dadosNormalizados.length ===
          0
        ) {
          setErroCardapio(
            "A tabela cardapio respondeu, mas nenhum registro válido foi encontrado."
          );
        }
      } catch (erro) {
        console.error(
          "💥 ERRO INESPERADO:",
          erro
        );

        if (!ativo) return;

        setCardapio([]);

        if (
          erro instanceof Error
        ) {
          setErroCardapio(
            `Erro ao carregar cardápio: ${erro.message}`
          );
        } else {
          setErroCardapio(
            "Erro desconhecido ao carregar o cardápio."
          );
        }
      } finally {
        if (ativo) {
          setCarregandoCardapio(
            false
          );
        }
      }
    }

    carregarCardapio();

    return () => {
      ativo = false;
    };
  }, [logado]);

  /* =========================================================
     CARREGAR AVALIAÇÕES DO FIREBASE
  ========================================================= */

  useEffect(() => {
    let ativo = true;

    async function carregarAvaliacoes() {
      if (!logado) return;
      const { data, error } = await firebaseDb
        .from("avaliacao_alimentacao")
        .select("id, registro_id, data, grupo, refeicao, preparacao, alunos, gostaram, nao_gostaram, nome_responsavel, cargo_responsavel")
        .order("data", { ascending: false });

      if (!ativo) return;

      if (error) {
        console.error(
          "ERRO AO CARREGAR AVALIAÇÕES:",
          error
        );
        return;
      }

      const avaliacaoBanco: Avaliacao[] =
        (data ?? []).map((item: any) => ({
          id: Number(item.id),
          registroId: Number(
            item.registro_id ?? 0
          ),
          data: normalizarData(item.data),
          grupo: String(
            item.grupo ?? ""
          ).trim(),
          refeicao:
            normalizarRefeicao(item.refeicao) ||
            ("Almoço" as Refeicao),
          preparacao: String(
            item.preparacao ?? ""
          ).trim(),
          alunos: Number(
            item.alunos ?? 0
          ),
          gostaram: Number(
            item.gostaram ?? 0
          ),
          naoGostaram: Number(
            item.nao_gostaram ?? 0
          ),
          nomeResponsavel: String(
            item.nome_responsavel ?? ""
          ).trim(),
          cargoResponsavel: String(
            item.cargo_responsavel ?? ""
          ).trim(),
          foto: normalizarFoto(
            item.foto ?? item.foto_url ?? item.imagem ?? item.imagem_url ?? item.foto_anexada
          ),
        }));

      setAvaliacoes(
        avaliacaoBanco
      );
    }

    carregarAvaliacoes();

    return () => {
      ativo = false;
    };
  }, [logado]);

  /* =========================================================
     INSTALAÇÃO
  ========================================================= */

  useEffect(() => {
    function capturarInstalacao(
      event: Event
    ) {
      event.preventDefault();

      setInstallPrompt(
        event as BeforeInstallPromptEvent
      );
    }

    window.addEventListener(
      "beforeinstallprompt",
      capturarInstalacao
    );

    function verificarInstalado() {
      const standalone =
        window.matchMedia(
          "(display-mode: standalone)"
        ).matches ||
        (
          window.navigator as Navigator & {
            standalone?: boolean;
          }
        ).standalone === true;

      if (standalone) {
        setAppInstalado(true);

        localStorage.setItem(
          "app_instalado",
          "sim"
        );
      }
    }

    verificarInstalado();

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        capturarInstalacao
      );
    };
  }, []);

  async function instalarAplicativo() {
    if (!installPrompt) {
      setAppInstalado(true);

      localStorage.setItem(
        "app_instalado",
        "sim"
      );

      alert(
        "Se o aplicativo já foi instalado, você pode marcar esta opção. Caso ainda não tenha instalado, use o menu do navegador e escolha 'Adicionar à tela inicial'."
      );

      return;
    }

    try {
      await installPrompt.prompt();

      const resultado =
        await installPrompt.userChoice;

      if (
        resultado.outcome ===
        "accepted"
      ) {
        setAppInstalado(true);

        localStorage.setItem(
          "app_instalado",
          "sim"
        );
      }

      setInstallPrompt(null);
    } catch {
      alert(
        "Não foi possível abrir a instalação automaticamente. Use a opção 'Adicionar à tela inicial' do navegador."
      );
    }
  }

  function confirmarAplicativoInstalado() {
    setAppInstalado(true);

    localStorage.setItem(
      "app_instalado",
      "sim"
    );
  }

  /* =========================================================
     NOTIFICAÇÕES
  ========================================================= */

  async function ativarNotificacoes() {
    if (!("Notification" in window)) {
      alert(
        "Este navegador não oferece suporte a notificações."
      );

      return;
    }

    try {
      const permissao =
        await Notification.requestPermission();

      if (
        permissao === "granted"
      ) {
        setNotificacoesAtivas(true);

        localStorage.setItem(
          "notificacoes_ativas",
          "sim"
        );

        new Notification(
          "Alimentação Escolar",
          {
            body:
              perfil === "cozinha"
                ? "Notificações ativadas. Você receberá lembretes para registrar as refeições."
                : "Notificações ativadas. Você receberá lembretes sobre as avaliações.",
          }
        );
      } else {
        alert(
          "As notificações não foram autorizadas. Você pode ativá-las nas configurações do navegador."
        );
      }
    } catch {
      alert(
        "Não foi possível ativar as notificações."
      );
    }
  }

  useEffect(() => {
    if (!logado || !perfil) {
      return;
    }

    if (!notificacoesAtivas) {
      return;
    }

    if (!("Notification" in window)) {
      return;
    }

    if (
      Notification.permission !==
      "granted"
    ) {
      return;
    }

    const chaveHoje =
      `notificacao_${perfil}_${obterDataHoje()}`;

    if (
      localStorage.getItem(
        chaveHoje
      )
    ) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        if (perfil === "cozinha") {
          new Notification(
            "Lembrete da cozinha 🍽️",
            {
              body:
                "Não esqueça de registrar a refeição que foi realmente servida hoje.",
            }
          );
        }

        if (perfil === "professor") {
          new Notification(
            "Lembrete dos professores 👩‍🏫",
            {
              body:
                "Confira os registros da cozinha e faça as avaliações de aceitabilidade disponíveis.",
            }
          );
        }

        localStorage.setItem(
          chaveHoje,
          "sim"
        );
      }, 3000);

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    logado,
    perfil,
    notificacoesAtivas,
  ]);

  /* =========================================================
     LOGIN
  ========================================================= */

  async function fazerLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMensagemLogin("");

    const loginDigitado =
      normalizarTexto(usuario);

    const senhaDigitada =
      String(senha ?? "").replace(
        /\D/g,
        ""
      );

    if (!loginDigitado) {
      setMensagemLogin(
        "Informe o login."
      );
      return;
    }

    if (!senhaDigitada) {
      setMensagemLogin(
        "Informe a senha."
      );
      return;
    }

    const loginOriginal = String(usuario ?? "").trim();
    const loginSomenteDigitos = loginOriginal.replace(/\D/g, "");

    // Busca os funcionários e compara o login de forma normalizada.
    // Ignora maiúsculas/minúsculas, acentos e espaços extras para
    // aceitar variações como Secretaria/Secretária, Cozinheira,
    // Cozinheiro, Professora e Professor.
    try {
    const { data, error } = await firebaseDb
      .from("funcionarios")
      .select("id, nome, login, senha, grupo")
      .limit(1000);

      if (error) {
        console.error(
          "ERRO NO LOGIN - FIREBASE:",
          error
        );
        setMensagemLogin(
          `Erro ao consultar funcionários: ${error.message}`
        );
        return;
      }

      if (
        !data ||
        data.length === 0
      ) {
        setMensagemLogin(
          "Nenhum funcionário foi encontrado. Verifique a tabela funcionarios e as permissões do Firebase."
        );
        return;
      }

      const funcionariosCompatíveis = (data ?? []).filter(
        (funcionario: any) => {
          const loginBanco = normalizarTexto(funcionario.login);
          return (
            loginBanco === loginDigitado ||
            (loginSomenteDigitos && loginBanco === loginSomenteDigitos)
          );
        }
      );

      const funcionarioEncontrado =
        funcionariosCompatíveis.find(
          (funcionario: any) => {
            const loginBanco =
              normalizarTexto(
                funcionario.login
              );

            const senhaBanco =
              String(
                funcionario.senha ?? ""
              ).replace(
                /\D/g,
                ""
              );

            return (
              loginBanco ===
                loginDigitado &&
              senhaBanco ===
                senhaDigitada
            );
          }
        );

      if (!funcionarioEncontrado) {
        setMensagemLogin(
          "Login ou senha incorretos. Confira os dados cadastrados na tabela funcionarios."
        );
        return;
      }

      const loginNormalizado =
        normalizarTexto(
          funcionarioEncontrado.login
        );

      const nomeNormalizado =
        normalizarTexto(
          funcionarioEncontrado.nome
        );

      let perfilEncontrado:
        | Perfil
        | null = null;

      let cargoResponsavel = "";

      if (
        nomeNormalizado.includes(
          "erica"
        ) ||
        nomeNormalizado.includes(
          "erika"
        )
      ) {
        perfilEncontrado =
          "erica";
        cargoResponsavel =
          "Erica";
      } else if (
        loginNormalizado.includes(
          "secretaria"
        ) ||
        loginNormalizado.includes(
          "secretario"
        )
      ) {
        perfilEncontrado =
          "secretaria";
        cargoResponsavel =
          "Secretária";
      } else if (
        loginNormalizado.includes(
          "professor"
        )
      ) {
        perfilEncontrado =
          "professor";
        cargoResponsavel =
          "Professor(a)";
      } else if (
        loginNormalizado.includes(
          "auxiliar"
        )
      ) {
        perfilEncontrado =
          "professor";
        cargoResponsavel =
          "Auxiliar";
      } else if (
        loginNormalizado.includes(
          "assistente"
        )
      ) {
        perfilEncontrado =
          "professor";
        cargoResponsavel =
          "Assistente";
      } else if (
        loginNormalizado.includes(
          "cozinheira"
        ) ||
        loginNormalizado.includes(
          "cozinheiro"
        ) ||
        loginNormalizado.includes(
          "cozinha"
        ) ||
        loginNormalizado.includes(
          "alimentacao"
        )
      ) {
        perfilEncontrado =
          "cozinha";
        cargoResponsavel =
          "Cozinha";
      }

      if (!perfilEncontrado) {
        setMensagemLogin(
          `O funcionário foi encontrado, mas o login "${funcionarioEncontrado.login}" não possui um perfil de acesso configurado.`
        );
        return;
      }

      setFuncionarioLogado({
        id: Number(
          funcionarioEncontrado.id
        ),
        nome: String(
          funcionarioEncontrado.nome ??
            ""
        ).trim(),
        login: String(
          funcionarioEncontrado.login ??
            ""
        ).trim(),
        grupo: String(
          funcionarioEncontrado.grupo ??
            ""
        ).trim(),
        cargo: cargoResponsavel,
      });

      setPerfil(
        perfilEncontrado
      );
      const sessaoParaPersistir: SessaoPersistida = {
        perfil: perfilEncontrado,
        funcionarioLogado: {
          id: Number(funcionarioEncontrado.id),
          nome: String(funcionarioEncontrado.nome ?? "").trim(),
          login: String(funcionarioEncontrado.login ?? "").trim(),
          grupo: String(funcionarioEncontrado.grupo ?? "").trim(),
          cargo: cargoResponsavel,
        },
      };

      localStorage.setItem(
        CHAVE_SESSAO,
        JSON.stringify(sessaoParaPersistir)
      );

      setLogado(true);
      setMensagemLogin("");
      setSenha("");

      if (
        perfilEncontrado ===
        "secretaria"
      ) {
        setTela("inicio");
      } else if (
        perfilEncontrado ===
          "professor" ||
        perfilEncontrado ===
          "erica"
      ) {
        setTela(
          "professor"
        );
      } else if (
        perfilEncontrado ===
        "cozinha"
      ) {
        setTela("cozinha");
      }
    } catch (erro) {
      console.error(
        "ERRO INESPERADO NO LOGIN:",
        erro
      );
      setMensagemLogin(
        "Erro ao conectar ao sistema. Verifique sua conexão com a internet e o Firebase."
      );
    }
  }

  function sair() {
    localStorage.removeItem(CHAVE_SESSAO);
    setLogado(false);
    setPerfil(null);
    setTela("inicio");
    setUsuario("");
    setSenha("");
    setFuncionarioLogado(null);
  }

  /* =========================================================
     ABAS
  ========================================================= */

  function abasPermitidas(): {
    tela: Tela;
    nome: string;
    icone: string;
  }[] {
    if (perfil === "secretaria") {
      return [
        {
          tela: "inicio",
          nome: "Início",
          icone: "🏠",
        },
        {
          tela: "cozinha",
          nome: "Cozinha",
          icone: "👩‍🍳",
        },
        {
          tela: "professor",
          nome:
            "Professores / Assistentes",
          icone: "👩‍🏫",
        },
        {
          tela: "secretaria",
          nome: "Resultados",
          icone: "📊",
        },
        {
          tela: "planilhas",
          nome: "Planilhas",
          icone: "📋",
        },
      ];
    }

    if (perfil === "professor") {
      return [
        {
          tela: "professor",
          nome:
            "Professores / Assistentes",
          icone: "👩‍🏫",
        },
      ];
    }

    if (perfil === "cozinha") {
      return [
        {
          tela: "cozinha",
          nome: "Cozinha",
          icone: "👩‍🍳",
        },
        {
          tela: "secretaria",
          nome: "Resultados",
          icone: "📊",
        },
      ];
    }

    return [];
  }

  /* =========================================================
     LOGIN
  ========================================================= */

  if (!logado) {
    return (
      <Login
        usuario={usuario}
        senha={senha}
        mensagem={mensagemLogin}
        onUsuarioChange={
          setUsuario
        }
        onSenhaChange={setSenha}
        onSubmit={fazerLogin}
        appInstalado={
          appInstalado
        }
        installPrompt={
          installPrompt
        }
        onInstalar={
          instalarAplicativo
        }
        onJaInstalado={
          confirmarAplicativoInstalado
        }
        notificacoesAtivas={
          notificacoesAtivas
        }
        onAtivarNotificacoes={
          ativarNotificacoes
        }
      />
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white md:block">
        <div className="flex items-center gap-3 p-6">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white">
            <img
              src="/logo.png"
              alt="Nossa Infância Maria Antonia"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <h1 className="font-bold text-slate-800">
              Maria Antonia
            </h1>

            <p className="text-xs text-slate-500">
              Sistema de Alimentação Escolar
            </p>
          </div>
        </div>

        <nav className="space-y-1 px-3">
          {abasPermitidas().map(
            (aba) => (
              <MenuButton
                key={aba.tela}
                ativo={
                  tela === aba.tela
                }
                onClick={() =>
                  setTela(
                    aba.tela
                  )
                }
              >
                {aba.icone}{" "}
                {aba.nome}
              </MenuButton>
            )
          )}
        </nav>

        <div className="absolute bottom-0 w-full border-t border-slate-200 p-4">
          <div className="mb-4 rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              Perfil conectado
            </p>

            <p className="mt-1 font-semibold text-slate-800">
              {doisPrimeirosNomes(
                funcionarioLogado?.nome
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={sair}
            className="w-full rounded-xl border border-red-200 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            🚪 Sair
          </button>
        </div>
      </aside>

      <main className="md:ml-72">
        <div className="mx-auto max-w-7xl p-4 pb-10 md:p-10">
          <div className="mb-6 flex items-center justify-between md:hidden">
            <div>
              <p className="text-xs text-slate-500">
                Perfil
              </p>

              <p className="font-bold text-slate-800">
                {doisPrimeirosNomes(
                  funcionarioLogado?.nome
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={sair}
              className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"
            >
              Sair
            </button>
          </div>

          <div className="mb-6 flex gap-2 overflow-x-auto pb-2 md:hidden">
            {abasPermitidas().map(
              (aba) => (
                <button
                  key={aba.tela}
                  type="button"
                  onClick={() =>
                    setTela(
                      aba.tela
                    )
                  }
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${
                    tela === aba.tela
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-slate-600"
                  }`}
                >
                  {aba.icone}{" "}
                  {aba.nome}
                </button>
              )
            )}
          </div>

          {tela === "inicio" &&
            perfil ===
              "secretaria" && (
              <Inicio
                registros={
                  registrosCozinha
                }
                avaliacoes={
                  avaliacoes
                }
              />
            )}

          {tela === "cozinha" &&
            (perfil ===
              "cozinha" ||
              perfil ===
                "secretaria") && (
              <Cozinha
                registros={
                  registrosCozinha
                }
                setRegistros={
                  setRegistrosCozinha
                }
                cardapio={
                  cardapio
                }
                carregandoCardapio={
                  carregandoCardapio
                }
                erroCardapio={
                  erroCardapio
                }
                grupos={grupos}
                funcionarioLogado={funcionarioLogado}
              />
            )}

          {tela === "professor" &&
            (perfil ===
              "professor" ||
              perfil ===
                "erica" ||
              perfil ===
                "secretaria") && (
              <ProfessorAssistente
                registros={
                  registrosCozinha
                }
                avaliacoes={
                  avaliacoes
                }
                setAvaliacoes={
                  setAvaliacoes
                }
                funcionarioLogado={
                  funcionarioLogado
                }
                perfil={perfil}
              />
            )}

          {tela === "planilhas" && perfil === "secretaria" && (
            <PlanilhaFrontEnd
              cardapio={cardapio}
              avaliacoes={avaliacoes}
            />
          )}

          {tela === "secretaria" && (
            <DashboardResultados avaliacoes={avaliacoes} registros={registrosCozinha} />
          )}
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   LOGIN
========================================================= */

function Login({
  usuario,
  senha,
  mensagem,
  onUsuarioChange,
  onSenhaChange,
  onSubmit,
  appInstalado,
  installPrompt,
  onInstalar,
  onJaInstalado,
  notificacoesAtivas,
  onAtivarNotificacoes,
}: {
  usuario: string;
  senha: string;
  mensagem: string;
  onUsuarioChange: (
    valor: string
  ) => void;
  onSenhaChange: (
    valor: string
  ) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>
  ) => void;
  appInstalado: boolean;
  installPrompt:
    | BeforeInstallPromptEvent
    | null;
  onInstalar: () => void;
  onJaInstalado: () => void;
  notificacoesAtivas: boolean;
  onAtivarNotificacoes: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto flex min-h-[90vh] max-w-md flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-white">
            <img
              src="/logo.png"
              alt="Nossa Infância Maria Antonia"
              className="h-full w-full object-contain"
            />
          </div>

          <h1 className="mt-5 text-3xl font-bold text-slate-800">
            Maria Antonia
          </h1>

          <p className="mt-2 text-slate-500">
            Sistema de Alimentação
            Escolar
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">
            Entrar
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Informe seu usuário e
            senha.
          </p>

          <form
            onSubmit={onSubmit}
            className="mt-6 space-y-5"
          >
            <div>
              <label
                htmlFor="login-usuario"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Login
              </label>

              <input
                id="login-usuario"
                name="usuario"
                type="text"
                value={usuario}
                onChange={(e) =>
                  onUsuarioChange(
                    e.target.value
                  )
                }
                required
                autoComplete="username"
                placeholder="Digite seu login"
                className="w-full rounded-xl border border-black px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label
                htmlFor="login-senha"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Senha
              </label>

              <input
                id="login-senha"
                name="senha"
                type="password"
                value={senha}
                onChange={(e) =>
                  onSenhaChange(
                    e.target.value
                  )
                }
                required
                autoComplete="current-password"
                placeholder="Digite sua senha"
                className="w-full rounded-xl border border-black px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {mensagem && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700"
              >
                {mensagem}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700"
            >
              Entrar
            </button>
          </form>

         
        </div>

        <div className="mt-5 space-y-3">
          {!appInstalado ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex gap-3">
                <span className="text-2xl">
                  📲
                </span>

                <div className="flex-1">
                  <p className="font-bold text-emerald-800">
                    Adicione o aplicativo
                  </p>

                  <p className="mt-1 text-sm text-emerald-700">
                    Tenha o sistema na
                    tela inicial do
                    celular para acessar
                    mais rapidamente.
                  </p>

                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={
                        onInstalar
                      }
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      📲 Adicionar à
                      tela inicial
                    </button>

                    <button
                      type="button"
                      onClick={
                        onJaInstalado
                      }
                      className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700"
                    >
                      ✓ Já adicionei à
                      tela inicial
                    </button>
                  </div>

                  {!installPrompt && (
                    <p className="mt-3 text-xs text-emerald-700">
                      Se o botão de
                      instalação não
                      abrir
                      automaticamente,
                      use o menu do
                      navegador e
                      escolha
                      "Adicionar à
                      tela inicial".
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-800">
                ✓ Aplicativo
                instalado
              </p>

              <p className="mt-1 text-sm text-emerald-700">
                O sistema já está
                marcado como
                adicionado à tela
                inicial.
              </p>
            </div>
          )}

          {!notificacoesAtivas ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex gap-3">
                <span className="text-2xl">
                  🔔
                </span>

                <div className="flex-1">
                  <p className="font-bold text-blue-800">
                    Ative as
                    notificações
                  </p>

                  <p className="mt-1 text-sm text-blue-700">
                    Receba lembretes para
                    registrar refeições
                    e realizar as
                    avaliações.
                  </p>

                  <button
                    type="button"
                    onClick={
                      onAtivarNotificacoes
                    }
                    className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    🔔 Ativar
                    notificações
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="font-semibold text-blue-800">
                🔔 Notificações
                ativadas
              </p>

              <p className="mt-1 text-sm text-blue-700">
                Os lembretes estão
                ativados neste
                dispositivo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MENU
========================================================= */

function MenuButton({
  children,
  ativo,
  onClick,
}: {
  children: ReactNode;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
        ativo
          ? "bg-emerald-50 text-emerald-700"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

/* =========================================================
   CABEÇALHO
========================================================= */

function PageHeader({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao?: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold text-slate-800">
        {titulo}
      </h1>

      {descricao && (
        <p className="mt-2 text-slate-500">
          {descricao}
        </p>
      )}
    </header>
  );
}

/* =========================================================
   INÍCIO
========================================================= */

function Inicio({
  registros,
  avaliacoes,
}: {
  registros: RegistroCozinha[];
  avaliacoes: Avaliacao[];
}) {
  const alunosAvaliados =
    avaliacoes.reduce(
      (total, item) =>
        total + item.alunos,
      0
    );

  const totalGostaram =
    avaliacoes.reduce(
      (total, item) =>
        total + item.gostaram,
      0
    );

  const aceitabilidade =
    alunosAvaliados > 0
      ? (
          (totalGostaram /
            alunosAvaliados) *
          100
        ).toFixed(1)
      : "0,0";

  return (
    <section>
      <PageHeader
        titulo="Olá! 👋"
        descricao="Bem-vindo ao sistema de alimentação escolar."
      />

      <div className="grid gap-5 md:grid-cols-3">
        <Card
          titulo="Refeições registradas"
          valor={String(
            registros.length
          )}
        />

        <Card
          titulo="Aceitabilidade média"
          valor={`${aceitabilidade.replace(
            ".",
            ","
          )}%`}
          verde
        />

        <Card
          titulo="Alunos avaliados"
          valor={String(
            alunosAvaliados
          )}
        />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">
          Como o sistema funciona
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <InfoBox
            icone="👩‍🍳"
            titulo="Cozinha"
            texto="Registra a preparação que realmente foi servida."
          />

          <InfoBox
            icone="👩‍🏫"
            titulo="Professores / Assistentes"
            texto="Avaliam a aceitabilidade das preparações registradas pela cozinha."
          />

          <InfoBox
            icone="📊"
            titulo="Resultados"
            texto="Acompanhe os resultados das avaliações realizadas."
          />
        </div>
      </div>

    </section>
  );
}

/* =========================================================
   COZINHA
========================================================= */

function Cozinha({
  registros,
  setRegistros,
  cardapio,
  carregandoCardapio,
  erroCardapio,
  grupos,
  funcionarioLogado,
}: {
  registros: RegistroCozinha[];
  setRegistros: Dispatch<SetStateAction<RegistroCozinha[]>>;
  cardapio: Cardapio[];
  carregandoCardapio: boolean;
  erroCardapio: string;
  grupos: Grupo[];
  funcionarioLogado: { nome: string; login: string } | null;
}) {
  const [data, setData] =
    useState(obterDataHoje());

  // A cozinha registra automaticamente para todos os grupos cadastrados.
  const grupo: Grupo = "TODOS OS GRUPOS";

  const [refeicao, setRefeicao] =
    useState<Refeicao>(
      "Lanche da manhã"
    );

  const [preparacaoSelecionada, setPreparacaoSelecionada] = useState("");



  const [foto, setFoto] =
    useState<string | null>(null);

  /* =========================================================
     PREPARAÇÕES DO CARDÁPIO PARA A REFEIÇÃO
  ========================================================= */

 const preparacoesDaRefeicao = useMemo(() => {
  const mapa = new Map<string, Cardapio>();

  // Ano selecionado no campo de data
  const anoAtual = normalizarData(data).substring(0, 4);

  for (const item of cardapio) {
    if (
      normalizarTexto(item.refeicao) !==
      normalizarTexto(refeicao)
    ) {
      continue;
    }

    const preparacao = String(item.preparacao ?? "").trim();

    if (!preparacao) continue;

    const chave = normalizarTexto(preparacao);

    // Verifica se a preparação já foi registrada
    // em qualquer mês do mesmo ano
    const jaRealizadaNoAno = registros.some((registro) => {
      const dataRegistro = normalizarData(registro.data);

      return (
        dataRegistro.substring(0, 4) === anoAtual &&
        normalizarTexto(registro.servida) === chave
      );
    });

    // Se já foi registrada no ano, não aparece
    if (jaRealizadaNoAno) continue;

    if (!mapa.has(chave)) {
      mapa.set(chave, item);
    }
  }

  return Array.from(mapa.values());
}, [cardapio, refeicao, registros, data]);

  const servida = preparacaoSelecionada;

  

  function alterarRefeicao(novaRefeicao: Refeicao) {
    setRefeicao(novaRefeicao);
    setPreparacaoSelecionada("");

  }

  /* =========================================================
     SALVAR REFEIÇÃO
  ========================================================= */

  async function salvarRefeicao(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (carregandoCardapio) {
      alert("Aguarde o carregamento do cardápio.");
      return;
    }

    if (!servida.trim()) {
      alert("Selecione a preparação que foi servida.");
      return;
    }

    const gruposParaSalvar =
      normalizarTexto(grupo) === normalizarTexto("TODOS OS GRUPOS")
        ? grupos
        : [grupo];

    const gruposValidos = Array.from(
      new Set(
        gruposParaSalvar
          .map((item) => String(item).trim())
          .filter((item) => item && normalizarTexto(item) !== normalizarTexto("TODOS OS GRUPOS"))
      )
    );

    if (gruposValidos.length === 0) {
      alert("Nenhum grupo cadastrado no Firebase para registrar a refeição.");
      return;
    }

    const horario = obterHorarioAtual();

    const registrosParaBanco = gruposValidos.map((grupoIndividual) => ({
    data,
    grupo: grupoIndividual,
    refeicao,
    servida,
    horario,
    unidade_escolar: "CNI MARIA ANTONIA",
    turno: "INTEGRAL",
    registrado_por: funcionarioLogado?.nome ?? "",
    // A tabela registro_refeicoes utiliza foto_url (e não foto).
    foto_url: foto,
  }));

    const { data: dadosSalvos, error } = await firebaseDb
      .from("registro_refeicoes")
      .insert(registrosParaBanco)
      .select("id, data, grupo, refeicao, servida, horario, registrado_por");

    if (error) {
      console.error("ERRO AO SALVAR REGISTRO DE REFEIÇÃO:", error);
      alert(
        `Não foi possível salvar a refeição no Firebase.\n\nCódigo: ${error.code || "não informado"}\nMensagem: ${error.message || "não informada"}\nDetalhes: ${error.details || "não informado"}`
      );
      return;
    }

    const novosRegistros: RegistroCozinha[] = (dadosSalvos ?? []).map(
      (item: any) => ({
        id: Number(item.id),
        data: normalizarData(item.data),
        grupo: String(item.grupo ?? "").trim(),
        refeicao: normalizarRefeicao(item.refeicao) || refeicao,
        servida: String(item.servida ?? servida).trim(),
        horario: String(item.horario ?? horario).trim(),
        registradoPor: String(
          item.registrado_por ?? funcionarioLogado?.nome ?? ""
        ).trim(),
        foto: normalizarFoto(item.foto ?? item.foto_url ?? item.imagem ?? item.imagem_url ?? item.foto_anexada) || normalizarFoto(foto),
      })
    );

    setRegistros((anterior) => [
      ...novosRegistros,
      ...anterior,
    ]);

    alert(
      gruposValidos.length > 1
        ? `Refeição registrada com sucesso para ${gruposValidos.length} grupos.`
        : "Refeição registrada com sucesso!"
    );

    setPreparacaoSelecionada("");
    setFoto(null);
  }

  function handleFoto(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    if (!arquivo.type.startsWith("image/")) {
      alert("Selecione uma imagem válida.");
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => setFoto(String(leitor.result ?? ""));
    leitor.readAsDataURL(arquivo);
  }

  const [mesVisualizacao, setMesVisualizacao] = useState(() => obterDataHoje().substring(0, 7));

  useEffect(() => {
    const atualizarMes = () => setMesVisualizacao(obterDataHoje().substring(0, 7));
    const timer = window.setInterval(atualizarMes, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const mesesDisponiveis = useMemo(() => {
    const conjunto = new Set<string>([obterDataHoje().substring(0, 7)]);
    registros.forEach((registro) => {
      const mes = normalizarData(registro.data).substring(0, 7);
      if (mes) conjunto.add(mes);
    });
    return Array.from(conjunto).sort().reverse();
  }, [registros]);

  const formatarMesAno = (mes: string) => {
    const [ano, numero] = mes.split("-").map(Number);
    if (!ano || !numero) return mes;
    const texto = new Date(ano, numero - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };

  const registrosExibicao = useMemo(() => {
    const mapa = new Map<string, RegistroCozinha & { gruposExibidos: string[] }>();

    for (const registro of registros.filter((item) => normalizarData(item.data).substring(0, 7) === mesVisualizacao)) {
      const chave = [
        normalizarData(registro.data),
        normalizarTexto(registro.refeicao),
        normalizarTexto(registro.servida),
        registro.horario,
        normalizarTexto(registro.registradoPor),
      ].join("|");

      const existente = mapa.get(chave);

      if (existente) {
        if (!existente.gruposExibidos.some((item) => normalizarTexto(item) === normalizarTexto(registro.grupo))) {
          existente.gruposExibidos.push(registro.grupo);
        }
      } else {
        mapa.set(chave, {
          ...registro,
          gruposExibidos: [registro.grupo],
        });
      }
    }

    return Array.from(mapa.values());
  }, [registros, mesVisualizacao]);

  return (
    <section>
      <PageHeader
        titulo="👩‍🍳 Cozinha"
        descricao="Registre a refeição que foi servida."
      />

      {carregandoCardapio && (
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-700">
          Carregando cardápio do
          Firebase...
        </div>
      )}

      {erroCardapio && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {erroCardapio}
        </div>
      )}

      <div className="max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form
          onSubmit={salvarRefeicao}
          className="space-y-6"
        >
          <div>
            <label
              htmlFor="cozinha-data"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Data
            </label>

            <input
              id="cozinha-data"
              name="data"
              type="date"
              value={data}
              onChange={(e) =>
                setData(
                  e.target.value
                )
              }
              required
              className="w-full rounded-xl border border-black px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <span className="mb-3 block text-sm font-semibold text-slate-700">
              Refeição
            </span>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {REFEICOES.map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      alterarRefeicao(
                        item
                      )
                    }
                    className={`rounded-xl border p-3 text-sm font-semibold transition ${
                      refeicao === item
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <label
              htmlFor="cozinha-preparacao-servida"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Preparação servida
            </label>

            <select
              id="cozinha-preparacao-servida"
              name="preparacao_servida"
              value={preparacaoSelecionada}
              onChange={(e) => setPreparacaoSelecionada(e.target.value)}
              required
              className="w-full rounded-xl border border-black bg-white px-4 py-3 outline-none focus:border-emerald-500"
            >
              <option value="">Selecione a preparação servida</option>
              {preparacoesDaRefeicao.map((item) => (
                <option key={item.id} value={item.preparacao}>
                  {item.preparacao}
                </option>
              ))}
            </select>

            {preparacoesDaRefeicao.length === 0 && (
              <p className="mt-2 text-sm text-amber-600">
                Nenhuma preparação cadastrada para esta refeição no cardápio.
              </p>
            )}

            
          </div>

        

          <div>
            <label
              htmlFor="cozinha-foto"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Foto da preparação
            </label>

            <label
              htmlFor="cozinha-foto"
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-solid border-black p-8 transition hover:border-emerald-500 hover:bg-emerald-50"
            >
              <span className="text-4xl">
                📷
              </span>

              <span className="mt-2 text-sm text-slate-600">
                Tirar ou escolher
                foto
              </span>

              <input
                id="cozinha-foto"
                name="foto"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFoto}
                className="hidden"
              />
            </label>

            {foto && (
              <img
                src={foto}
                alt="Pré-visualização da preparação"
                className="mt-4 max-h-72 w-full rounded-xl object-cover"
              />
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700"
          >
            ✓ Salvar refeição
          </button>
        </form>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Visualizar por mês</label>
          <select value={mesVisualizacao} onChange={(e) => setMesVisualizacao(e.target.value)} className="w-full max-w-xs rounded-xl border border-black bg-white px-4 py-3">
            {mesesDisponiveis.map((mes) => (
              <option key={mes} value={mes}>{formatarMesAno(mes)}</option>
            ))}
          </select>
        </div>

        <h2 className="text-xl font-bold text-slate-800">
          Registros realizados
        </h2>

        <div className="mt-5 max-h-[calc(100dvh-18rem)] overflow-x-auto overflow-y-scroll md:max-h-none">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="p-3">
                  Data
                </th>

               

                <th className="p-3">
                  Refeição
                </th>

                <th className="p-3">
                  Preparação
                </th>

                 <th className="p-3">
                  Grupo
                </th>

                

                <th className="p-3">
                  Registrado por
                </th>

                <th className="p-3">
                  Foto
                </th>
              </tr>
            </thead>

            <tbody>
              {registrosExibicao.length ===
                0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-slate-500"
                  >
                    Nenhuma refeição
                    foi registrada
                    ainda.
                  </td>
                </tr>
              )}

              {registrosExibicao.map(
                (registro) => (
                  <tr
                    key={
                      registro.id
                    }
                    className="border-b border-slate-100"
                  >
                    <td className="p-3">
                      {formatarDataBR(
                        registro.data
                      )}
                    </td>

                    

                    <td className="p-3">
                      {
                        registro.refeicao
                      }
                    </td>

                     <td className="p-3 font-semibold text-slate-800">
                      {
                        registro.servida
                      }
                    </td>
                    <td className="p-3">
                      {registro.gruposExibidos.join(", ")}
                    </td>

                   

                    <td className="p-3">
                      {nomeExibicao(registro.registradoPor)}
                    </td>

                    <td className="p-3">
                      {registro.foto ? (
                        <img
                          src={registro.foto}
                          alt={`Foto da preparação ${registro.servida}`}
                          className="h-20 w-24 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Sem foto</span>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   PROFESSORES / ASSISTENTES
========================================================= */

function ProfessorAssistente({
  registros,
  avaliacoes,
  setAvaliacoes,
  funcionarioLogado,
  perfil,
}: {
  registros: RegistroCozinha[];
  avaliacoes: Avaliacao[];
  setAvaliacoes: Dispatch<SetStateAction<Avaliacao[]>>;
  perfil: Perfil | null;
  funcionarioLogado: {
    id: number;
    nome: string;
    login: string;
    grupo: string;
    cargo: string;
  } | null;
}) {
  const [
    registroSelecionadoId,
    setRegistroSelecionadoId,
  ] = useState<number | null>(null);

  const [alunos, setAlunos] = useState(0);

  const [
    gostaram,
    setGostaram,
  ] = useState(0);


  const [fotoAvaliacao, setFotoAvaliacao] = useState<string | null>(null);

  const [erroAvaliacao, setErroAvaliacao] = useState("");

  const cargoNormalizado = normalizarTexto(funcionarioLogado?.cargo);

  const podeCadastrarFoto =
    cargoNormalizado.includes("professor") ||
    cargoNormalizado.includes("secretaria") ||
    cargoNormalizado.includes("coordenadora") ||
    cargoNormalizado.includes("gestora");

  const [
    mesVisualizacaoProfessor,
    setMesVisualizacaoProfessor,
  ] = useState(() =>
    obterDataHoje().substring(0, 7)
  );

  const mesesDisponiveisProfessor = useMemo(() => {
    const conjunto = new Set<string>([
      obterDataHoje().substring(0, 7),
    ]);

    registros.forEach((registro) => {
      const mes = normalizarData(
        registro.data
      ).substring(0, 7);

      if (mes) {
        conjunto.add(mes);
      }
    });

    return Array.from(conjunto)
      .sort()
      .reverse();
  }, [registros]);

  useEffect(() => {
    const atualizarMes = () =>
      setMesVisualizacaoProfessor(
        obterDataHoje().substring(0, 7)
      );

    const timer = window.setInterval(
      atualizarMes,
      60000
    );

    return () =>
      window.clearInterval(timer);
  }, []);

  const formatarMesAnoProfessor = (
    mes: string
  ) => {
    const [ano, numero] = mes
      .split("-")
      .map(Number);

    if (!ano || !numero) {
      return mes;
    }

    const texto = new Date(
      ano,
      numero - 1,
      1
    ).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    return (
      texto.charAt(0).toUpperCase() +
      texto.slice(1)
    );
  };

  const registrosVisiveis = useMemo(() => {
    const filtradosPorMes =
      registros.filter(
        (registro) =>
          normalizarData(
            registro.data
          ).substring(0, 7) ===
          mesVisualizacaoProfessor
      );

    /*
     * Professor visualiza somente
     * os registros do próprio grupo.
     *
     * Assistente visualiza todos
     * os grupos.
     */
    if (
      !funcionarioLogado ||
      perfil !== "professor"
    ) {
      return filtradosPorMes;
    }

    const grupoDoProfissional =
      normalizarTexto(
        funcionarioLogado.grupo
      );

    if (!grupoDoProfissional) {
      return [];
    }

    return filtradosPorMes.filter(
      (registro) =>
        normalizarTexto(
          registro.grupo
        ) === grupoDoProfissional
    );
  }, [
    registros,
    funcionarioLogado,
    perfil,
    mesVisualizacaoProfessor,
  ]);

  const registroSelecionado =
    registrosVisiveis.find(
      (item) =>
        item.id ===
        registroSelecionadoId
    ) ?? null;

  // O total de alunos é compartilhado entre as avaliações do mesmo dia.
  // Assim, depois que um professor informa esse total em uma refeição,
  // ele é reutilizado automaticamente nas demais refeições daquele dia.
  const obterTotalAlunosDoDia = (data: string): number => {
    const avaliacaoDoDia = avaliacoes
      .filter(
        (avaliacao) =>
          normalizarData(avaliacao.data) === normalizarData(data) &&
          Number(avaliacao.alunos) > 0
      )
      .sort((a, b) => Number(b.id) - Number(a.id))[0];

    return avaliacaoDoDia ? Math.max(0, Number(avaliacaoDoDia.alunos) || 0) : 0;
  };

  /*
   * Verifica somente se o registro
   * específico já foi avaliado.
   *
   * Não verifica preparação realizada
   * no mês.
   */
  const jaAvaliado = (
    registro: RegistroCozinha
  ) => {
    return avaliacoes.some(
      (avaliacao) => {
        /*
         * Regra principal:
         * a avaliação pertence exatamente
         * ao registro da cozinha.
         */
        if (
          Number(
            avaliacao.registroId
          ) > 0
        ) {
          return (
            Number(
              avaliacao.registroId
            ) === Number(registro.id)
          );
        }

        /*
         * Compatibilidade com avaliações
         * antigas sem registro_id.
         */
        return (
          normalizarData(
            avaliacao.data
          ) ===
            normalizarData(
              registro.data
            ) &&
          normalizarTexto(
            avaliacao.grupo
          ) ===
            normalizarTexto(
              registro.grupo
            ) &&
          normalizarTexto(
            avaliacao.refeicao
          ) ===
            normalizarTexto(
              registro.refeicao
            ) &&
          normalizarTexto(
            avaliacao.preparacao
          ) ===
            normalizarTexto(
              registro.servida
            )
        );
      }
    );
  };

  function selecionarRegistro(
    registro: RegistroCozinha
  ) {
    /*
     * Só impede selecionar um registro
     * que já foi avaliado.
     *
     * NÃO existe aqui nenhuma verificação
     * de preparação realizada no mês.
     */
    if (jaAvaliado(registro)) {
      alert(
        "Este registro de refeição já foi avaliado."
      );

      return;
    }

    setRegistroSelecionadoId(
      registro.id
    );

    // Se outra refeição do mesmo dia já foi avaliada,
    // reaproveita automaticamente o total de alunos informado.
    setAlunos(obterTotalAlunosDoDia(registro.data));
    setGostaram(0);
    setFotoAvaliacao(null);
    setErroAvaliacao("");

    /*
     * Depois que o formulário aparecer,
     * leva automaticamente a tela até ele.
     */
    setTimeout(() => {
      document
        .getElementById(
          "form-avaliacao"
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 150);
  }

  async function salvarAvaliacao(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErroAvaliacao("");

    if (!funcionarioLogado) {
      alert(
        "Não foi possível identificar o profissional logado."
      );

      return;
    }

    if (!registroSelecionado) {
      alert(
        "Selecione primeiro um registro da cozinha."
      );

      return;
    }

    if (alunos <= 0) {
      alert(
        "Informe o total de alunos."
      );

      return;
    }

    if (gostaram < 0 || gostaram > alunos) {
      alert(
        "O número de alunos que gostaram deve estar entre 0 e o total de alunos."
      );

      return;
    }

    // "Não gostaram" não é mais digitado: é calculado automaticamente.
    const naoGostaramCalculado = Math.max(0, alunos - gostaram);

    /*
     * Confere novamente se ESTE registro
     * já foi avaliado.
     *
     * Não verifica preparação mensal.
     */
    if (
      jaAvaliado(
        registroSelecionado
      )
    ) {
      alert(
        "Este registro de refeição já foi avaliado."
      );

      return;
    }

    const resultadoAvaliacao = await firebaseDb
      .from(
        "avaliacao_alimentacao"
      )
      .insert({
        unidade_escolar:
          "CNI MARIA ANTONIA",

        turno:
          "INTEGRAL",

        data:
          registroSelecionado.data,

        registro_id:
          registroSelecionado.id,

        grupo:
          registroSelecionado.grupo,

        refeicao:
          registroSelecionado.refeicao,

        preparacao:
          registroSelecionado.servida,

        alunos,

        gostaram,

        nao_gostaram:
          naoGostaramCalculado,

        nome_responsavel:
          funcionarioLogado.nome,

        cargo_responsavel:
          funcionarioLogado.cargo,

        foto: fotoAvaliacao,
      })
      .select();

    const data = resultadoAvaliacao.data?.[0] ?? null;
    const error = resultadoAvaliacao.error;

    if (error) {
      const erroDetalhado = [
        `Código: ${
          error.code ||
          "não informado"
        }`,
        `Mensagem: ${
          error.message ||
          "não informada"
        }`,
        `Detalhes: ${
          error.details ||
          "não informado"
        }`,
        `Sugestão: ${
          error.hint ||
          "não informada"
        }`,
      ].join("\n");

      console.error(
        "ERRO AO SALVAR AVALIAÇÃO NO FIREBASE:",
        error
      );

      setErroAvaliacao(
        erroDetalhado
      );

      return;
    }

    const novaAvaliacao: Avaliacao = {
      id: Number(data?.id),

      registroId:
        registroSelecionado.id,

      data:
        registroSelecionado.data,

      grupo:
        registroSelecionado.grupo,

      refeicao:
        registroSelecionado.refeicao,

      preparacao:
        registroSelecionado.servida,

      alunos,

      gostaram,

      naoGostaram: naoGostaramCalculado,

      nomeResponsavel:
        funcionarioLogado.nome,

      cargoResponsavel:
        funcionarioLogado.cargo,

      foto: podeCadastrarFoto ? fotoAvaliacao || undefined : undefined,
    };

    setAvaliacoes(
      (anterior) => [
        novaAvaliacao,
        ...anterior,
      ]
    );

    alert(
      `Avaliação registrada com sucesso!\n\nResponsável: ${funcionarioLogado.nome}\nCargo: ${funcionarioLogado.cargo}`
    );

    setRegistroSelecionadoId(
      null
    );

    setAlunos(0);
    setGostaram(0);
    setFotoAvaliacao(null);
    setErroAvaliacao("");
  }

  const percentual =
    alunos > 0
      ? (
          (gostaram / alunos) *
          100
        ).toFixed(1)
      : "0.0";

  function handleFotoAvaliacao(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    if (!arquivo.type.startsWith("image/")) {
      alert("Selecione uma imagem válida.");
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => setFotoAvaliacao(String(leitor.result ?? ""));
    leitor.readAsDataURL(arquivo);
  }

  return (
    <section>
      <PageHeader
        titulo="👩‍🏫 Professores / Assistentes"
        descricao="Selecione um registro realizado pela cozinha para avaliar a aceitabilidade."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">

          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Visualizar por mês
          </label>

          <select
            value={
              mesVisualizacaoProfessor
            }
            onChange={(e) =>
              setMesVisualizacaoProfessor(
                e.target.value
              )
            }
            className="w-full max-w-xs rounded-xl border border-black bg-white px-4 py-3"
          >
            {mesesDisponiveisProfessor.map(
              (mes) => (
                <option
                  key={mes}
                  value={mes}
                >
                  {formatarMesAnoProfessor(
                    mes
                  )}
                </option>
              )
            )}
          </select>

        </div>

        <div className="mt-6 max-h-[calc(100dvh-18rem)] overflow-x-auto overflow-y-scroll md:max-h-none">

        <table className="w-full min-w-[1000px] text-left text-sm">

  <thead>
    <tr className="border-b border-slate-200 text-slate-500">

      <th className="p-3">
        Ação
      </th>

      <th className="p-3">
        Data
      </th>

      <th className="p-3">
        Preparação
      </th>

      <th className="p-3">
        Grupo
      </th>

      <th className="p-3">
        Refeição
      </th>

      <th className="p-3">
        Registrado por
      </th>

    </tr>
  </thead>

  <tbody>

    {registrosVisiveis.length === 0 && (
      <tr>
        <td
          colSpan={6}
          className="p-8 text-center text-slate-500"
        >
          Nenhum registro da cozinha disponível para o seu grupo.
        </td>
      </tr>
    )}

    {registrosVisiveis.map((registro) => {

      const avaliado = jaAvaliado(registro);

      return (
        <tr
          key={registro.id}
          className="border-b border-slate-100"
        >

          {/* AÇÃO */}
          <td className="p-3">
            {avaliado ? (
              <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                ✓ Já avaliada
              </span>
            ) : (
              <button
                type="button"
                onClick={() =>
                  selecionarRegistro(registro)
                }
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Avaliar
              </button>
            )}
          </td>

          {/* DATA */}
          <td className="p-3">
            {formatarDataBR(registro.data)}
          </td>

          {/* PREPARAÇÃO */}
          <td className="p-3 font-semibold">
            {registro.servida}
          </td>

          {/* GRUPO */}
          <td className="p-3">
            {registro.grupo}
          </td>

          {/* REFEIÇÃO */}
          <td className="p-3">
            {registro.refeicao}
          </td>

          {/* REGISTRADO POR */}
          <td className="p-3">
            {nomeExibicao(registro.registradoPor)}
          </td>

        </tr>
      );
    })}

  </tbody>

</table>

        </div>

      </div>

      {registroSelecionado && (
        <div
          id="form-avaliacao"
          className="mt-8 max-w-4xl rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"
        >

          <div className="rounded-2xl bg-emerald-50 p-5">

            <p className="text-sm font-semibold text-emerald-700">
              Avaliação da
              preparação
            </p>

            <h2 className="mt-2 text-xl font-bold text-slate-800">
              {
                registroSelecionado.servida
              }
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-4">

              <InfoMini
                titulo="Data"
                valor={formatarDataBR(
                  registroSelecionado.data
                )}
              />

              <InfoMini
                titulo="Grupo"
                valor={
                  registroSelecionado.grupo
                }
              />

              <InfoMini
                titulo="Refeição"
                valor={
                  registroSelecionado.refeicao
                }
              />

            </div>

          </div>

          {erroAvaliacao && (
            <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5">

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                <h3 className="font-bold text-red-700">
                  ❌ Erro ao salvar avaliação
                </h3>

                <div className="flex gap-2">

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          erroAvaliacao
                        );

                        alert(
                          "Erro copiado."
                        );
                      } catch {
                        alert(
                          "Não foi possível copiar automaticamente. Selecione o texto manualmente."
                        );
                      }
                    }}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    📋 Copiar erro
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setErroAvaliacao("")
                    }
                    className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Fechar
                  </button>

                </div>

              </div>

              <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-sm text-red-800">
                {erroAvaliacao}
              </pre>

            </div>
          )}

          <form
            onSubmit={salvarAvaliacao}
            className="mt-6 space-y-6"
          >

            <div className="grid gap-4 md:grid-cols-2">

              <CampoNumero
                id="avaliacao-alunos"
                name="alunos"
                titulo="Total de alunos"
                valor={alunos}
                onChange={setAlunos}
              />

              <CampoNumero
                id="avaliacao-gostaram"
                name="gostaram"
                titulo="Gostaram 👍"
                valor={gostaram}
                onChange={
                  setGostaram
                }
              />

            </div>

            {podeCadastrarFoto && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                <label
                  htmlFor="avaliacao-foto"
                  className="block text-sm font-bold text-indigo-900"
                >
                  📸 Foto das plaquinhas de acessibilidade
                </label>

                <p className="mt-1 text-sm text-indigo-700">
                  Anexe uma foto mostrando as plaquinhas utilizadas pelos alunos.
                </p>

                <input
                  id="avaliacao-foto"
                  name="foto_avaliacao"
                  type="file"
                  accept="image/*"
                  onChange={handleFotoAvaliacao}
                  className="mt-3 block w-full rounded-xl border border-indigo-300 bg-white p-3 text-sm"
                />

                {fotoAvaliacao && (
                  <div className="mt-4">
                    <img
                      src={fotoAvaliacao}
                      alt="Pré-visualização da foto das plaquinhas de acessibilidade"
                      className="max-h-80 w-full rounded-xl object-contain"
                    />

                    <button
                      type="button"
                      onClick={() => setFotoAvaliacao(null)}
                      className="mt-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700"
                    >
                      Remover foto
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl bg-emerald-50 p-6 text-center">

              <p className="text-sm font-medium text-slate-600">
                Aceitabilidade
              </p>

              <p className="mt-1 text-5xl font-bold text-emerald-600">
                {percentual}%
              </p>

            </div>

            <div className="flex flex-col gap-3 md:flex-row">

              <button
                type="submit"
                className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
              >
                ✓ Salvar
                avaliação
              </button>

              <button
                type="button"
                onClick={() =>
                  setRegistroSelecionadoId(
                    null
                  )
                }
                className="rounded-xl border border-black px-5 py-3 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>

            </div>

          </form>

        </div>
      )}
    </section>
  );
}

function DashboardResultados({
  avaliacoes,
  registros,
}: {
  avaliacoes: Avaliacao[];
  registros: RegistroCozinha[];
}) {
  const mesAtual = obterDataHoje().substring(0, 7);
  const avaliacoesDoMes = avaliacoes.filter(
    (avaliacao) => normalizarData(avaliacao.data).substring(0, 7) === mesAtual
  );

  const totalAvaliacoes = avaliacoesDoMes.length;
  const totalAlunos = avaliacoesDoMes.reduce(
    (total, avaliacao) => total + Number(avaliacao.alunos || 0),
    0
  );
  const totalGostaram = avaliacoesDoMes.reduce(
    (total, avaliacao) => total + Number(avaliacao.gostaram || 0),
    0
  );
  const totalNaoGostaram = avaliacoesDoMes.reduce(
    (total, avaliacao) => total + Number(avaliacao.naoGostaram || 0),
    0
  );
  const totalRespostas = totalGostaram + totalNaoGostaram;
  const percentualAceitacao = totalRespostas > 0
    ? Math.round((totalGostaram / totalRespostas) * 100)
    : 0;

  const mesFormatado = new Date(`${mesAtual}-01T12:00:00`).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" }
  );

  // Mostra TODOS os registros, mesmo quando nenhuma das duas fotos existe.
  // A avaliação é relacionada pelo registro_id; o fallback mantém compatibilidade
  // com avaliações antigas que não possuem esse vínculo.
  const linhasResultados = [...registros]
    .sort((a, b) => {
      const dataA = normalizarData(a.data);
      const dataB = normalizarData(b.data);
      return dataB.localeCompare(dataA) || Number(b.id) - Number(a.id);
    })
    .map((registro) => {
      const avaliacao = avaliacoes.find((item) => {
        if (Number(item.registroId) > 0) {
          return Number(item.registroId) === Number(registro.id);
        }

        return (
          normalizarData(item.data) === normalizarData(registro.data) &&
          normalizarTexto(item.grupo) === normalizarTexto(registro.grupo) &&
          normalizarTexto(item.refeicao) === normalizarTexto(registro.refeicao) &&
          normalizarTexto(item.preparacao) === normalizarTexto(registro.servida)
        );
      });

      return { registro, avaliacao };
    });

  function baixarFoto(foto: string, nome: string) {
    const link = document.createElement("a");
    link.href = foto;
    link.download = `${nome.replace(/[^a-z0-9-_]/gi, "-")}.jpg`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Dashboard de Resultados</h2>
        <p className="mt-1 text-sm text-slate-500">
          Visão geral das avaliações de {mesFormatado} e lista completa das refeições registradas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { titulo: "Avaliações", valor: totalAvaliacoes, detalhe: "registradas no mês" },
          { titulo: "Alunos avaliados", valor: totalAlunos, detalhe: "participantes" },
          { titulo: "Gostaram", valor: totalGostaram, detalhe: "respostas positivas" },
          { titulo: "Aceitação", valor: `${percentualAceitacao}%`, detalhe: "índice geral" },
        ].map((card) => (
          <div key={card.titulo} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{card.titulo}</p>
            <p className="mt-2 text-3xl font-bold text-slate-800">{card.valor}</p>
            <p className="mt-1 text-xs text-slate-400">{card.detalhe}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {linhasResultados.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Nenhuma refeição registrada.
          </p>
        ) : (
          <div className="max-h-[calc(100dvh-20rem)] overflow-x-auto overflow-y-scroll md:max-h-none">
            <table className="min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Grupo</th>
                  <th className="px-3 py-3">Refeição / preparação</th>
                  <th className="px-3 py-3">Fotos</th>
                  <th className="px-3 py-3">Avaliação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhasResultados.map(({ registro, avaliacao }) => (
                  <tr key={registro.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                      {formatarDataBR(registro.data)}
                    </td>
                    <td className="px-3 py-4 text-slate-600">{registro.grupo || "Não informado"}</td>
                    <td className="min-w-56 px-3 py-4">
                      <p className="font-semibold text-slate-800">{registro.refeicao}</p>
                      <p className="text-slate-600">{registro.servida || "Não informado"}</p>
                      <p className="text-xs text-slate-400">Horário: {registro.horario || "—"}</p>
                    </td>
                    <td className="min-w-72 px-3 py-4">
                      <div className="flex flex-wrap gap-4">
                        <div className="w-28">
                          <p className="mb-1 text-xs font-semibold text-slate-500">Cozinha</p>
                          {registro.foto ? (
                            <>
                              <img src={registro.foto} alt="Foto da cozinha" className="h-24 w-28 rounded-lg border object-cover" />
                              <button type="button" onClick={() => baixarFoto(registro.foto as string, `cozinha-${registro.id}`)} className="mt-1 text-xs font-semibold text-emerald-700">Baixar</button>
                            </>
                          ) : <span className="text-xs text-slate-400">Sem foto</span>}
                        </div>
                        <div className="w-28">
                          <p className="mb-1 text-xs font-semibold text-slate-500">Professor</p>
                          {avaliacao?.foto ? (
                            <>
                              <img src={avaliacao.foto} alt="Foto do professor" className="h-24 w-28 rounded-lg border object-cover" />
                              <button type="button" onClick={() => baixarFoto(avaliacao.foto as string, `professor-${avaliacao.id}`)} className="mt-1 text-xs font-semibold text-emerald-700">Baixar</button>
                            </>
                          ) : <span className="text-xs text-slate-400">Sem foto</span>}
                        </div>
                      </div>
                    </td>
                    <td className="min-w-44 px-3 py-4">
                      {avaliacao ? (
                        <>
                          <p className="font-semibold text-slate-800">{avaliacao.nomeResponsavel || "Responsável não informado"}</p>
                          <p className="text-xs text-slate-500">Gostaram: {avaliacao.gostaram} | Não gostaram: {avaliacao.naoGostaram}</p>
                          <p className="text-xs text-slate-500">Alunos: {avaliacao.alunos}</p>
                        </>
                      ) : <span className="text-xs text-slate-400">Ainda não avaliado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function PlanilhaFrontEnd({
  cardapio,
  avaliacoes,
}: {
  cardapio: Cardapio[];
  avaliacoes: Avaliacao[];
}) {
  const meses = [
    { value: "01", label: "JANEIRO" },
    { value: "02", label: "FEVEREIRO" },
    { value: "03", label: "MARÇO" },
    { value: "04", label: "ABRIL" },
    { value: "05", label: "MAIO" },
    { value: "06", label: "JUNHO" },
    { value: "07", label: "JULHO" },
    { value: "08", label: "AGOSTO" },
    { value: "09", label: "SETEMBRO" },
    { value: "10", label: "OUTUBRO" },
    { value: "11", label: "NOVEMBRO" },
    { value: "12", label: "DEZEMBRO" },
  ];

  const [mesSelecionado, setMesSelecionado] = useState(
    obterDataHoje().substring(0, 7)
  );

  const nomeMes =
    meses.find(
      (mes) => mes.value === mesSelecionado.substring(5, 7)
    )?.label || mesSelecionado.substring(5, 7);

  const linhasPlanilha = useMemo(() => {
    const refeicaoCanonica = (valor: unknown): Refeicao | "" => {
      const normalizada = normalizarRefeicao(valor);
      return REFEICOES.includes(normalizada as Refeicao)
        ? (normalizada as Refeicao)
        : "";
    };

    type LinhaPlanilha = {
      tipo: "refeicao" | "preparacao";
      refeicao: Refeicao;
      preparacao?: string;
      datas?: string[];
      grupos?: string[];
      totalAlunos?: number;
      totalGostaram?: number;
      percentual?: number;
      resultado?: "ACEITO" | "REPROVADO" | "SEM AVALIAÇÃO";
    };

    const avaliacoesDoMes = avaliacoes.filter((avaliacao) =>
      normalizarData(avaliacao.data).substring(0, 7) === mesSelecionado
    );

    /*
     * A Planilha não lê uma aba "Resultados".
     * Ela usa diretamente as avaliações salvas e consolida todos os grupos.
     */
    const preparacoes = new Map<string, {
      refeicao: Refeicao;
      preparacao: string;
    }>();

    cardapio.forEach((item) => {
      const refeicao = refeicaoCanonica(item.refeicao);
      const preparacao = String(item.preparacao || "").trim();
      if (!refeicao || !preparacao) return;

      const chave = `${refeicao}||${normalizarTexto(preparacao)}`;
      if (!preparacoes.has(chave)) {
        preparacoes.set(chave, { refeicao, preparacao });
      }
    });

    /* Inclui também alguma preparação que tenha avaliação no mês,
       mesmo que ela não esteja mais no cardápio atualmente carregado. */
    avaliacoesDoMes.forEach((avaliacao) => {
      const refeicao = refeicaoCanonica(avaliacao.refeicao);
      const preparacao = String(avaliacao.preparacao || "").trim();
      if (!refeicao || !preparacao) return;

      const chave = `${refeicao}||${normalizarTexto(preparacao)}`;
      if (!preparacoes.has(chave)) {
        preparacoes.set(chave, { refeicao, preparacao });
      }
    });

    const linhas: LinhaPlanilha[] = [];

    REFEICOES.forEach((refeicao) => {
      const preparacoesDaRefeicao = Array.from(preparacoes.values())
        .filter((item) => item.refeicao === refeicao)
        .sort((a, b) => a.preparacao.localeCompare(b.preparacao, "pt-BR"));

      if (preparacoesDaRefeicao.length === 0) return;

      linhas.push({
        tipo: "refeicao",
        refeicao,
      });

      preparacoesDaRefeicao.forEach((item) => {
        const avaliacoesDaPreparacao = avaliacoesDoMes.filter(
          (avaliacao) =>
            refeicaoCanonica(avaliacao.refeicao) === refeicao &&
            normalizarTexto(avaliacao.preparacao) ===
              normalizarTexto(item.preparacao)
        );

        const totalAlunos = avaliacoesDaPreparacao.reduce(
          (total, avaliacao) => total + Math.max(0, Number(avaliacao.alunos) || 0),
          0
        );

        const totalGostaram = avaliacoesDaPreparacao.reduce(
          (total, avaliacao) => total + Math.max(0, Number(avaliacao.gostaram) || 0),
          0
        );

        const percentual =
          totalAlunos > 0
            ? (totalGostaram / totalAlunos) * 100
            : 0;

        const resultado =
          totalAlunos === 0
            ? "SEM AVALIAÇÃO"
            : percentual >= 60
              ? "ACEITO"
              : "REPROVADO";

        const datas = Array.from(
          new Set(
            avaliacoesDaPreparacao
              .map((avaliacao) => normalizarData(avaliacao.data))
              .filter(Boolean)
          )
        ).sort();

        const grupos = Array.from(
          new Set(
            avaliacoesDaPreparacao
              .map((avaliacao) => String(avaliacao.grupo || "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, "pt-BR"));

        linhas.push({
          tipo: "preparacao",
          refeicao,
          preparacao: item.preparacao,
          datas,
          grupos,
          totalAlunos,
          totalGostaram,
          percentual,
          resultado,
        });
      });
    });

    return linhas;
  }, [cardapio, avaliacoes, mesSelecionado]);





const exportarPlanilha = async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Planilha de Aceitabilidade");

  const borda: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };

  const azulCabecalho = "FFDDEBF7";

  const dados: any[][] = [
    ["SECRETARIA DE EDUCAÇÃO, CULTURA E ESPORTE"],
    ["GESTÃO DE ALIMENTAÇÃO ESCOLAR"],
    ["NOME DA UNIDADE ESCOLAR: CNI MARIA ANTONIA"],
    [`MÊS DA COLETA: ${nomeMes}`],
    [""],
    ["PLANILHA DE CONTROLE DE TESTE DE ACEITABILIDADE – CARDÁPIO DE CRECHES"],
    [""],
    [
      "PREPARAÇÃO AVALIADA",
      "DATA DA COLETA",
      "TURMA / FAIXA ETÁRIA",
      "Nº DE ALUNOS",
      "ACEITAÇÃO (%)",
      "RESULTADO\n(≥ 60% ACEITO)",
    ],
  ];

  linhasPlanilha.forEach((linha) => {
    if (linha.tipo === "refeicao") {
      dados.push([linha.refeicao, "", "", "", "", ""]);
      return;
    }

    dados.push([
      linha.preparacao || "",
      linha.datas?.map(formatarDataBR).join(", ") || "",
      "GRUPO 2 E 3 - 2 E 3 ANOS",
      linha.totalAlunos === 0 ? "" : linha.totalAlunos,
      linha.totalAlunos === 0 ? "" : `${linha.percentual?.toFixed(2)}%`,
      linha.totalAlunos === 0 ? "" : linha.resultado || "",
    ]);
  });

  dados.push([""]);
  dados.push([
    "OBS: Realizar a coleta de todas as preparações do cardápio durante o ano letivo.",
  ]);

  // Mantém todo o conteúdo da planilha em LETRAS MAIÚSCULAS.
  const dadosEmMaiusculo = dados.map((linha) =>
    linha.map((valor) =>
      typeof valor === "string" ? valor.toLocaleUpperCase("pt-BR") : valor
    )
  );

  worksheet.addRows(dadosEmMaiusculo);

  // Larguras aproximadas em centímetros convertidas para a unidade de largura do Excel.
  worksheet.columns = [
    { width: 65 }, // A: aproximadamente 12,00 cm
    { width: 28 }, // B: aproximadamente 5,10 cm
    { width: 32 }, // C: aproximadamente 5,96 cm
    { width: 17 }, // D: aproximadamente 3,13 cm
    { width: 17 }, // E: aproximadamente 3,15 cm
    { width: 34 }, // F: aproximadamente 6,30 cm
  ];

  // A linha 7 é apenas um espaçamento no modelo e não deve existir.
  worksheet.spliceRows(7, 1);

  // Área azul A1:F6: mescla cada linha, mas mantém somente a borda externa do retângulo.
  [1, 2, 3, 4, 5, 6].forEach((numeroLinha) => {
    for (let coluna = 1; coluna <= 6; coluna++) {
      const cell = worksheet.getCell(numeroLinha, coluna);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: azulCabecalho },
      };
      cell.border = {};
    }

    worksheet.mergeCells(numeroLinha, 1, numeroLinha, 6);
    const cell = worksheet.getCell(numeroLinha, 1);
    cell.border = {
      top: numeroLinha === 1 ? borda.top : undefined,
      bottom: numeroLinha === 6 ? borda.bottom : undefined,
      left: borda.left,
      right: borda.right,
    };
  });

  for (let linha = 1; linha <= 4; linha++) {
    const cell = worksheet.getCell(linha, 1);
    cell.font = { name: "Arial", size: 12, bold: true };
    cell.alignment = { horizontal: "left", vertical: "middle" };
  }

  const titulo = worksheet.getCell("A6");
  titulo.font = { name: "Arial", size: 14, bold: true };
  titulo.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  titulo.border = {
    bottom: borda.bottom,
    left: borda.left,
    right: borda.right,
  };

  // Cabeçalho das colunas: primeira letra maiúscula e restante em minúsculo.
  const cabecalhos = [
    "Preparação avaliada",
    "Data da coleta",
    "Turma / faixa etária",
    "Nº de alunos",
    "Aceitação (%)",
    "Resultado\n(≥ 60% aceito)",
  ];

  worksheet.getRow(7).height = 38;

  for (let coluna = 1; coluna <= 6; coluna++) {
    const cell = worksheet.getCell(7, coluna);
    cell.value = cabecalhos[coluna - 1];
    cell.font = { name: "Arial", size: 12, bold: true };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = borda;
  }

  // Corpo da planilha: refeições ficam mescladas, centralizadas e em negrito.
  linhasPlanilha.forEach((linha, index) => {
    const numeroLinha = 8 + index;

    if (linha.tipo === "refeicao") {
      worksheet.mergeCells(numeroLinha, 1, numeroLinha, 6);
      const cell = worksheet.getCell(numeroLinha, 1);
      cell.value = String(cell.value || "").toLocaleUpperCase("pt-BR");
      cell.font = { name: "Arial", size: 12, bold: true };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = borda;
      worksheet.getRow(numeroLinha).height = 32;

      for (let coluna = 2; coluna <= 6; coluna++) {
        worksheet.getCell(numeroLinha, coluna).border = borda;
      }
      return;
    }

    for (let coluna = 1; coluna <= 6; coluna++) {
      const cell = worksheet.getCell(numeroLinha, coluna);
      cell.font = { name: "Arial", size: 12 };
      cell.alignment = {
        horizontal: coluna === 1 ? "left" : "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = borda;
    }

    // Altura proporcional à quebra estimada na coluna A.
    // A coluna A tem largura 65; usamos uma margem para considerar espaços,
    // letras largas e a quebra automática do Excel, sem alongar linhas curtas.
    const preparacao = String(worksheet.getCell(numeroLinha, 1).value || "");
    const caracteresPorLinha = 42;
    const linhasNecessarias = Math.max(1, Math.ceil(preparacao.length / caracteresPorLinha));
    // Reserva espaço suficiente para que a última linha nunca fique cortada.
    const alturaLinha = 22 + (linhasNecessarias - 1) * 22;
    worksheet.getRow(numeroLinha).height = Math.min(88, alturaLinha);

    const resultado = String(worksheet.getCell(numeroLinha, 6).value || "");
    if (resultado === "ACEITO") {
      worksheet.getCell(numeroLinha, 6).font = {
        name: "Arial",
        size: 12,
        bold: true,
        color: { argb: "FF008000" },
      };
    }
    if (resultado === "REPROVADO") {
      worksheet.getCell(numeroLinha, 6).font = {
        name: "Arial",
        size: 12,
        bold: true,
        color: { argb: "FFFF0000" },
      };
    }
  });

  // A linha em branco antes da observação não recebe bordas.
  // A observação fica mesclada, em negrito e com um retângulo ao redor.
  const linhaObservacao = 9 + linhasPlanilha.length;
  for (let coluna = 1; coluna <= 6; coluna++) {
    worksheet.getCell(linhaObservacao - 1, coluna).border = {};
    worksheet.getCell(linhaObservacao, coluna).border = {};
  }
  worksheet.mergeCells(linhaObservacao, 1, linhaObservacao, 6);
  const observacao = worksheet.getCell(linhaObservacao, 1);
  observacao.value = String(observacao.value || "").toLocaleUpperCase("pt-BR");
  observacao.font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  observacao.alignment = {
    horizontal: "left",
    vertical: "middle",
    wrapText: true,
  };
  observacao.border = borda;

  // Insere somente a imagem fixa do projeto, sem criar colunas de fotos.
  const imagemParaBase64 = async (src: string): Promise<string> => {
    if (src.startsWith("data:image/")) return src;
    const resposta = await fetch(src);
    if (!resposta.ok) {
      throw new Error(`Não foi possível carregar a imagem (${resposta.status}).`);
    }
    const blob = await resposta.blob();
    return await new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = reject;
      leitor.readAsDataURL(blob);
    });
  };

  try {
    const base64 = await imagemParaBase64(imagemPlanilha);
    const extensao = base64.includes("image/png") ? "png" : "jpeg";
    const imageId = workbook.addImage({ base64, extension: extensao });
    worksheet.addImage(imageId, {
      tl: { col: 5.60, row: 0.17 },
      ext: { width: 100, height: 90 },
    });
  } catch (erro) {
    console.warn("Imagem do modelo não adicionada à planilha:", erro);
  }

  const arquivo = await workbook.xlsx.writeBuffer();
  const blob = new Blob([arquivo], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `planilha-aceitabilidade-${mesSelecionado}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
};


const exportarRegistros = async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Registros");

  const borda: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };

  // =========================================================
  // COLUNAS
  // =========================================================

  worksheet.columns = [
    { width: 28 }, // A
    { width: 24 }, // B
    { width: 14 }, // C
    { width: 18 }, // D
    { width: 42 }, // E
    { width: 28 }, // F
    { width: 32 }, // G
  ];

  // =========================================================
  // ÁREA DO LOGO + TÍTULO
  // =========================================================

  worksheet.mergeCells("A1:G2");

  const areaTitulo = worksheet.getCell("A1");

  areaTitulo.value = "REGISTROS DE ACEITABILIDADE";

  areaTitulo.font = {
    name: "Arial Black",
    size: 18,
    bold: true,
    color: {
      argb: "FF000000",
    },
  };

  areaTitulo.alignment = {
    horizontal: "center",
    vertical: "bottom",
  };

  // Altura total = 100 pontos ≈ 3,53 cm
  worksheet.getRow(1).height = 50;
  worksheet.getRow(2).height = 50;

  // Bordas da área do título
  for (let coluna = 1; coluna <= 7; coluna++) {
    worksheet.getCell(1, coluna).border = borda;
    worksheet.getCell(2, coluna).border = borda;
  }

  // =========================================================
  // LOGO DA PREFEITURA
  // =========================================================

  try {
    const resposta = await fetch(prefeituraLogo);

    if (!resposta.ok) {
      throw new Error(
        `Erro ao carregar prefeitura.png: ${resposta.status}`
      );
    }

    const blobLogo = await resposta.blob();

    const base64 = await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();

      leitor.onload = () => {
        resolve(String(leitor.result));
      };

      leitor.onerror = reject;

      leitor.readAsDataURL(blobLogo);
    });

    const imageId = workbook.addImage({
      base64,
      extension: "png",
    });

    /*
     * A área A:G possui larguras diferentes.
     * A posição abaixo deixa o centro da imagem
     * alinhado aproximadamente ao centro da tabela.
     */

    worksheet.addImage(imageId, {
      tl: {
        col: 3.98,
        row: 0.40,
      },
      ext: {
        width: 300,
        height: 50,
      },
    });
  } catch (erro) {
    console.warn(
      "Não foi possível adicionar prefeitura.png:",
      erro
    );
  }

  // =========================================================
  // CABEÇALHO DA TABELA
  // =========================================================

  const cabecalhos = [
    "Unidade escolar",
    "Turma ou grupo",
    "Turno",
    "Data do teste",
    "Nome da preparação",
    "Número de alunos que aprovaram a preparação",
    "Número de alunos que não gostaram da preparação",
  ];

  worksheet.getRow(3).values = cabecalhos;

  const cabecalho = worksheet.getRow(3);

  cabecalho.height = 60;

  cabecalho.eachCell((cell) => {
    cell.font = {
      name: "Arial",
      size: 12,
      bold: true,
      color: {
        argb: "FF000000",
      },
    };

    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    cell.border = borda;

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FFD9EAF7",
      },
    };
  });

  // =========================================================
  // DADOS
  // =========================================================

  const avaliacoesDoMes = avaliacoes
    .filter(
      (avaliacao) =>
        normalizarData(avaliacao.data).substring(0, 7) ===
        mesSelecionado
    )
    .sort((a, b) =>
      normalizarData(a.data).localeCompare(
        normalizarData(b.data)
      )
    );

  avaliacoesDoMes.forEach((avaliacao) => {
    const gostaram = Math.max(
      0,
      Number(avaliacao.gostaram) || 0
    );

    const naoGostaram = Math.max(
      0,
      Number(avaliacao.naoGostaram) || 0
    );

    const row = worksheet.addRow([
      "CNI MARIA ANTONIA",
      avaliacao.grupo || "",
      "INTEGRAL",
      formatarDataBR(avaliacao.data),
      avaliacao.preparacao || "",
      gostaram,
      naoGostaram,
    ]);

    // Altura das linhas dos dados
    row.height = 42;

    row.eachCell((cell) => {
      cell.font = {
        name: "Arial",
        size: 12,
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.border = borda;
    });
  });

  // =========================================================
  // CONFIGURAÇÃO DA PLANILHA
  // =========================================================

  worksheet.views = [
    {
      showGridLines: false,
    },
  ];

  // Paisagem
  worksheet.pageSetup.orientation = "landscape";

  // A4
  worksheet.pageSetup.paperSize = 9;

  // Uma página de largura
  // Várias páginas de altura, se necessário
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;

  // Margens
  worksheet.pageSetup.margins = {
    left: 0.25,
    right: 0.25,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };

  // =========================================================
  // REPETIR CABEÇALHO EM TODAS AS PÁGINAS
  // =========================================================

  worksheet.pageSetup.printTitlesRow = "3:3";

  // =========================================================
  // EXPORTAR
  // =========================================================

  const arquivo = await workbook.xlsx.writeBuffer();

  const blob = new Blob([arquivo], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download = `planilha-registros-${mesSelecionado}.xlsx`;

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
};
  

  return (
    <section>
      <PageHeader
        titulo="📊 Planilha de Controle de Teste de Aceitabilidade"
      />

      <div className="mb-4 flex flex-wrap gap-3">
  <button
    type="button"
    onClick={exportarPlanilha}
    className="rounded-md bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
  >
    📥 Baixar Planilha de Aceitabilidade
  </button>
  <button
    type="button"
    onClick={exportarRegistros}
    className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
  >
    📥 Baixar Planilha de Registros
  </button>
</div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            Mês da coleta
          </p>
        </div>

        <input
          type="month"
          value={mesSelecionado}
          onChange={(e) => setMesSelecionado(e.target.value)}
          className="rounded-md border border-black px-3 py-2"
        />
      </div>

      <div
        className="overflow-hidden rounded-md border border-black bg-white shadow-sm"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        <div className="border-b border-black bg-[#DDEBF7] px-4 py-5 text-start">
          <div className="flex flex-row justify-between gap-4">
            <div className="flex flex-col leading-tight">
              <p className="text-md font-bold">
                SECRETARIA DE EDUCAÇÃO, CULTURA E ESPORTE
              </p>
              <p className="mt-1 text-md font-bold">
                GESTÃO DE ALIMENTAÇÃO ESCOLAR
              </p>
              <p className="mt-1 text-md font-bold">
                NOME DA UNIDADE ESCOLAR: CNI MARIA ANTONIA
              </p>
              <p className="mt-1 text-md font-bold">
                MÊS DA COLETA: {nomeMes}
              </p>
            </div>

            <img
              src={imagemPlanilha}
              alt="Modelo da planilha"
              className="w-[120px] object-contain"
            />
          </div>

          <h2 className="mt-3 text-center text-lg text-base font-extrabold uppercase">
            PLANILHA DE CONTROLE DE TESTE DE ACEITABILIDADE – CARDÁPIO DE CRECHES
          </h2>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="min-w-[1200px] w-full table-auto border-collapse text-sm">
            <colgroup>
              <col style={{ width: "27%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
              
            </colgroup>

            <thead>
              <tr className="bg-white text-lg ">
                <th className="border border-black px-2 py-1 text-center font-bold leading-tight">
                  PREPARAÇÃO AVALIADA
                </th>
                <th className="border border-black px-2 py-1 text-center font-bold leading-tight">
                  DATA DA COLETA
                </th>

                 <th className="border border-black px-2 py-1 text-center font-bold leading-tight">
                  TURMA / FAIXA ETÁRIA
                </th>
            
                <th className="border border-black px-2 py-1 text-center font-bold leading-tight">
                  Nº DE ALUNOS
                </th>
              
                <th className="border border-black px-2 py-1 text-center font-bold leading-tight">
                  ACEITAÇÃO (%)
                </th>
                <th className="border border-black px-2 py-1 text-center font-bold leading-tight">
                  RESULTADO
                  <br />
                  (≥ 60% ACEITO)
                </th>
              </tr>
            </thead>

            <tbody>
              {linhasPlanilha.map((linha, index) => {
                if (linha.tipo === "refeicao") {
                  return (
                    <tr key={`refeicao-${linha.refeicao}-${index}`}>
                      <td
                        colSpan={6}
                        className="border border-black bg-white px-2 py-1 text-center text-base text-lg font-extrabold uppercase"
                      >
                        {linha.refeicao}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={`preparacao-${linha.refeicao}-${linha.preparacao}-${index}`}>
                    <td className="border border-black px-2 py-1 text-left text-lg font-medium uppercase">
                      {linha.preparacao}
                    </td>

                    <td className="border border-black px-2 py-1 text-center text-lg">
                      {linha.datas && linha.datas.length > 0
                        ? linha.datas.map(formatarDataBR).join(", ")
                        : ""}
                    </td>

                     <td className="border border-black px-2 py-1 text-center text-lg ">
                      GRUPO 2 E 3 - 2 E 3 ANOS
                    </td>

                   

                    <td className="border border-black px-2 py-1 text-center text-lg font-bold">
                      {linha.totalAlunos === 0 ? "" : linha.totalAlunos}
                    </td>

                    

                    <td className="border border-black px-2 py-1 text-center text-lg font-bold">
                    {linha.totalAlunos === 0
                      ? ""
                      : `${linha.percentual?.toFixed(2)}%`}
                  </td>

                   <td className={`border border-black px-2 py-1 text-center text-lg font-bold ${
                        linha.resultado === "ACEITO"
                          ? "text-green-700"
                          : linha.resultado === "REPROVADO"
                            ? "text-red-700"
                            : "text-slate-500"
                      }`}
                    >
                      {linha.totalAlunos === 0 ? "" : linha.resultado}
                    </td>
                  </tr>
                );
              })}

              {linhasPlanilha.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="border border-black px-4 py-8 text-center"
                  >
                    NÃO HÁ PREPARAÇÕES NO CARDÁPIO OU AVALIAÇÕES PARA O MÊS SELECIONADO.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-black bg-white px-4 py-3 text-[22px] text-black">
          <strong>
            OBS: Realizar a coleta de todas as preparações do cardápio durante o ano letivo.
          </strong>
        </div>
      </div>
      <div className="mt-8 overflow-hidden rounded-md border border-black bg-white shadow-sm" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        <div className="border-b border-black bg-[#DDEBF7] px-4 py-4">
          <h2 className="text-center text-lg font-extrabold uppercase">
            REGISTROS DO TESTE DE ACEITABILIDADE
          </h2>
         
        </div>
        <div className="w-full overflow-x-auto">
          <table className="min-w-[1400px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-white">
                {["UNIDADE ESCOLAR", "TURMA OU GRUPO", "TURNO", "DATA DO TESTE", "NOME DA PREPARAÇÃO", "Nº DE ALUNOS QUE APROVARAM", "Nº DE ALUNOS QUE NÃO GOSTARAM"].map((cabecalho) => (
                  <th key={cabecalho} className="border border-black px-2 py-2 text-center font-bold">{cabecalho}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {avaliacoes.filter((avaliacao) => normalizarData(avaliacao.data).substring(0, 7) === mesSelecionado).sort((a, b) => normalizarData(a.data).localeCompare(normalizarData(b.data))).map((avaliacao, index) => (
                <tr key={`registro-${index}`}>
                  <td className="border border-black px-2 py-2">CNI MARIA ANTONIA</td>
                  <td className="border border-black px-2 py-2 text-center">{avaliacao.grupo || ""}</td>
                  <td className="border border-black px-2 py-2 text-center">INTEGRAL</td>
                  <td className="border border-black px-2 py-2 text-center">{formatarDataBR(avaliacao.data)}</td>
                  <td className="border border-black px-2 py-2">{avaliacao.preparacao || ""}</td>
                  <td className="border border-black px-2 py-2 text-center">{Math.max(0, Number(avaliacao.gostaram) || 0)}</td>
                  <td className="border border-black px-2 py-2 text-center">{Math.max(0, Number(avaliacao.naoGostaram) || 0)}</td>
                </tr>
              ))}
              {avaliacoes.filter((avaliacao) => normalizarData(avaliacao.data).substring(0, 7) === mesSelecionado).length === 0 && (
                <tr><td colSpan={7} className="border border-black px-4 py-8 text-center">NÃO HÁ REGISTROS PARA O MÊS SELECIONADO.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </section>
  );
}

/* =========================================================
   COMPONENTES VISUAIS
========================================================= */

function Card({
  titulo,
  valor,
  verde = false,
}: {
  titulo: string;
  valor: string;
  verde?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">
        {titulo}
      </p>

      <p
        className={`mt-2 text-3xl font-bold ${
          verde
            ? "text-emerald-600"
            : "text-slate-800"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

function InfoBox({
  icone,
  titulo,
  texto,
}: {
  icone: string;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <div className="text-3xl">
        {icone}
      </div>

      <h3 className="mt-3 font-bold text-slate-800">
        {titulo}
      </h3>

      <p className="mt-1 text-sm leading-6 text-slate-500">
        {texto}
      </p>
    </div>
  );
}

function InfoMini({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs text-slate-500">
        {titulo}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-800">
        {valor}
      </p>
    </div>
  );
}

function CampoNumero({
  id,
  name,
  titulo,
  valor,
  onChange,
}: {
  id: string;
  name: string;
  titulo: string;
  valor: number;
  onChange: (
    valor: number
  ) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {titulo}
      </label>

      <input
        id={id}
        name={name}
        type="number"
        min="0"
        value={valor || ""}
        onChange={(e) =>
          onChange(
            Number(
              e.target.value
            )
          )
        }
        className="w-full rounded-xl border border-black px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </div>
  );
}

/* =========================================================
   PERFIL
========================================================= */

function doisPrimeirosNomes(
  nome: string | null | undefined
): string {
  if (!nome) {
    return "";
  }

  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

export default App;