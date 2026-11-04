# Centro de Inversión — portafolio de riesgo medio para Racional

Informes de inteligencia **diarios y semanales**, órdenes de **compra/venta** y **escenarios de impacto en CLP**, en un dashboard local interactivo.

> Herramienta de apoyo a la decisión basada en reglas cuantitativas. **No es asesoría financiera.** Tú decides y ejecutas en Racional.

## Uso diario (1 minuto)

```bash
./actualizar.sh          # descarga precios, genera informes y abre el dashboard
```

Ideal: cada día hábil **después de las 18:15 (hora de Chile)**, cuando ya cerró Wall Street. Si lo corres durante la sesión, el motor usa el cierre anterior (o `./actualizar.sh --intradia` para incluir el precio parcial de hoy).

El dashboard (`site/index.html`) se abre con doble clic. No necesita servidor ni internet una vez generado.

## Rutina sugerida

| Cuándo | Qué mirar | Acción en Racional |
|---|---|---|
| Diario | **Informe diario**: régimen, macro, alertas, cambios de señal | Solo órdenes **diarias** (opcionales) y stops |
| Semanal (ej. lunes) | **Informe semanal**: cambios del objetivo, riesgo, estrés | Ejecutar el **rebalanceo semanal** |
| Antes de cada orden | **Escenarios** y la tarjeta de la orden | Confirmar que la pérdida posible es aceptable |
| Después de ejecutar | Botón **Registrar como ejecutada** | Mantiene tus posiciones al día |

## Pestañas

- **Resumen**: patrimonio en CLP/USD, asignación actual vs objetivo, riesgo diario, lo esencial y próximos movimientos.
- **Informe diario**: narrativa, tablero macro (VIX, tasa 10 años, DXY, USD/CLP, cobre, petróleo, oro), alertas, señales de los 22 activos y órdenes tácticas.
- **Informe semanal**: cambios del portafolio objetivo, métricas de riesgo (VaR, peor mes, máxima caída), simulación de 3 años vs S&P 500 y 60/40, crisis reales y rebalanceo.
- **Órdenes**: diarias y semanales con monto en USD/CLP, unidades y, para cada una, *día malo*, *si toca el stop*, *mes pesimista/central/optimista*, *si el S&P cae 10%* y su efecto en la volatilidad de tu portafolio.
- **Escenarios**: 7 situaciones hipotéticas, 5 crisis reales y deslizadores (S&P, tasas, oro, cobre, USD/CLP). Compara tu portafolio vs el objetivo frente a tu tolerancia de pérdida.
- **Activos**: precio con medias de 50/200 días, puntaje histórico, RSI y por qué tiene esa señal.
- **Mis posiciones**: registra lo que tienes en Racional (se guarda en el navegador; exporta/importa JSON).

## Configuración

`config/portafolio.json`:

- `universo`: activos, clase y peso estratégico. Agrega o quita tickers de EE.UU. disponibles en Racional.
- `reglas`: banda de rebalanceo, tramos de entrada, riesgo por operación, techo/piso de renta variable, bloque satélite, etc.
- `posiciones`, `efectivo_usd`, `efectivo_clp`: punto de partida (también se edita desde el dashboard).

## Estructura

```
engine/motor.py        motor: datos, señales, objetivo táctico, riesgo, escenarios, narrativa
config/portafolio.json universo y reglas
site/index.html        dashboard
site/data/latest.js    último informe
site/data/archivo/     histórico de informes diarios y semanales
data/cache/            caché de precios (si falla la conexión se usa la caché)
```

Requisitos: Python 3.10+ con `pandas` y `numpy`.

## Publicación automática en GitHub Pages

El flujo `.github/workflows/informe.yml` corre **lunes a viernes a las 21:30 UTC** (18:30 en Chile en verano, 17:30 en invierno):

1. Instala Python y ejecuta `engine/motor.py` con precios del cierre.
2. Guarda el informe en `site/data/archivo/` (historial: 90 diarios y 104 semanales).
3. Publica `site/` en GitHub Pages.

También se ejecuta al hacer push de cambios en el código o la configuración, y a mano desde *Actions → Informe diario → Run workflow*.

**Privacidad:** el sitio publicado contiene solo datos de mercado y `config/portafolio.json`. Tus posiciones reales se guardan en el navegador de cada dispositivo (pestaña *Mis posiciones*; usa Exportar/Importar JSON para pasarlas entre dispositivos). **No pongas posiciones ni montos reales en `config/portafolio.json` si el repositorio es público.**
