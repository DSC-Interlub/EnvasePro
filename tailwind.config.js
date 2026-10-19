/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			// Raios da direção "Fluxo". Três papéis, não seis valores soltos.
  			token: 'var(--raio)',
  			'token-sm': 'var(--raio-pequeno)',
  			cartao: 'var(--raio-cartao)',
  			painel: 'var(--raio-painel)'
  		},
  		boxShadow: {
  			cartao: 'var(--sombra-cartao)',
  			'cartao-alta': 'var(--sombra-cartao-alta)',
  			marca: 'var(--sombra-marca)',
  			'marca-alta': 'var(--sombra-marca-alta)',
  			leve: 'var(--sombra-leve)',
  			foco: 'var(--sombra-foco)'
  		},
  		fontFamily: {
  			// Manrope e JetBrains Mono entram como PACOTE LOCAL (@fontsource),
  			// servidas pelo próprio domínio. Não via Google Fonts: seria uma
  			// origem externa na CSP e uma dependência de rede no tablet da
  			// fábrica. A pilha de sistema fica como reserva.
  			sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  			mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
  		},
  		transitionTimingFunction: {
  			fluxo: 'var(--curva)',
  			'fluxo-forte': 'var(--curva-forte)'
  		},
  		colors: {
  			// Tokens da direção "Fluxo". Os valores vivem em src/index.css,
  			// num lugar só, e o tema escuro os redefine para a TV.
  			// `<alpha-value>` preserva os modificadores de opacidade
  			// (bg-marca/50 continua funcionando).
  			marca: {
  				DEFAULT: 'rgb(var(--marca) / <alpha-value>)',
  				forte: 'rgb(var(--marca-forte) / <alpha-value>)',
  				suave: 'rgb(var(--marca-suave) / <alpha-value>)',
  				'suave-2': 'rgb(var(--marca-suave-2) / <alpha-value>)',
  			},
  			fundo: 'rgb(var(--fundo) / <alpha-value>)',
  			cartao: {
  				DEFAULT: 'rgb(var(--cartao) / <alpha-value>)',
  				fraco: 'rgb(var(--cartao-fraco) / <alpha-value>)',
  			},
  			tinta: {
  				DEFAULT: 'rgb(var(--tinta) / <alpha-value>)',
  				media: 'rgb(var(--tinta-media) / <alpha-value>)',
  			},
  			'texto-fraco': 'rgb(var(--texto-fraco) / <alpha-value>)',
  			'texto-apagado': 'rgb(var(--texto-apagado) / <alpha-value>)',
  			borda: 'rgb(var(--borda) / <alpha-value>)',
  			trilha: 'rgb(var(--trilha) / <alpha-value>)',
  			ok: {
  				DEFAULT: 'rgb(var(--ok) / <alpha-value>)',
  				suave: 'rgb(var(--ok-suave) / <alpha-value>)',
  			},
  			atencao: {
  				DEFAULT: 'rgb(var(--atencao) / <alpha-value>)',
  				suave: 'rgb(var(--atencao-suave) / <alpha-value>)',
  				tinta: 'rgb(var(--atencao-tinta) / <alpha-value>)',
  			},
  			erro: {
  				DEFAULT: 'rgb(var(--erro) / <alpha-value>)',
  				suave: 'rgb(var(--erro-suave) / <alpha-value>)',
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}