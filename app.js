// app.js
class SistemaHorariosPolicia {
    constructor() {
        this.datosEstaciones = [];
        this.datosCuadrantes = [];
        this.estadisticas = {
            totalEstaciones: 0,
            estacionesActivas: 0,
            cuadrantesATiempo: 0,
            cuadrantesAlerta: 0,
            cuadrantesRetraso: 0
        };
        this.inicializar();
    }

    inicializar() {
        this.configurarEventos();
        this.crearDatosEjemplo();
    }

    configurarEventos() {
        const fileInput = document.getElementById('excel-file');
        fileInput.addEventListener('change', (e) => this.manejarCargaArchivo(e));
        
        // Evento para exportar a PDF
        const exportButton = document.getElementById('export-pdf');
        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportarAPDF());
        }
    }

    async manejarCargaArchivo(evento) {
        const archivo = evento.target.files[0];
        if (!archivo) return;

        this.mostrarCarga(true);
        this.limpiarMensajes();

        try {
            const datos = await this.leerArchivoExcel(archivo);
            this.procesarDatosExcel(datos);
            this.renderizarEstaciones();
            this.actualizarEstadisticas();
            this.actualizarResumen();
            this.actualizarCuadrantesAlerta();
            this.actualizarCuadrantesRetraso();
            this.mostrarExito('Archivo cargado exitosamente');
            document.getElementById('comparison-section').style.display = 'block';
        } catch (error) {
            this.mostrarError('Error al procesar el archivo: ' + error.message);
        } finally {
            this.mostrarCarga(false);
        }
    }

    async leerArchivoExcel(archivo) {
        return new Promise((resolver, rechazar) => {
            const lector = new FileReader();
            lector.onload = (e) => {
                try {
                    const datos = new Uint8Array(e.target.result);
                    const libro = XLSX.read(datos, { type: 'array' });
                    resolver(libro);
                } catch (error) {
                    rechazar(error);
                }
            };
            lector.onerror = () => rechazar(new Error('Error al leer el archivo'));
            lector.readAsArrayBuffer(archivo);
        });
    }

    procesarDatosExcel(libro) {
        const primeraHoja = libro.Sheets[libro.SheetNames[0]];
        const datosJSON = XLSX.utils.sheet_to_json(primeraHoja);

        this.datosEstaciones = [];
        this.datosCuadrantes = [];

        const datosProcesados = this.organizarDatosPorEstacion(datosJSON);
        this.datosEstaciones = datosProcesados.estaciones;
        this.datosCuadrantes = datosProcesados.cuadrantes;

        document.getElementById('file-info').innerHTML = `
            <div class="success-message">
                <i class="fas fa-check-circle"></i>
                Archivo procesado: ${this.datosEstaciones.length} estaciones y ${this.datosCuadrantes.length} cuadrantes
            </div>
        `;
    }

    organizarDatosPorEstacion(datosJSON) {
        const mapaEstaciones = new Map();
        const mapaCuadrantes = new Map();

        datosJSON.forEach(fila => {
            const nombreEstacion = fila['Estacion'] || fila['Station'] || fila['ESTACION'] || Object.values(fila)[0];
            const nombreCuadrante = fila['Cuadrante'] || fila['Quadrant'] || fila['CUADRANTE'] || Object.values(fila)[1];
            const horaInicio = this.formatearHora(fila['Fecha'] || fila['Start_Time'] || fila['HORA_INICIO'] || Object.values(fila)[2]) || '06:00';

            if (nombreEstacion && nombreCuadrante) {
                if (!mapaEstaciones.has(nombreEstacion)) {
                    mapaEstaciones.set(nombreEstacion, {
                        id: `estacion_${mapaEstaciones.size + 1}`,
                        nombre: nombreEstacion,
                        horaInicioTurno: '06:00',
                        cuadrantes: [],
                        activa: true
                    });
                }

                const estacion = mapaEstaciones.get(nombreEstacion);
                const tiempoEstacion = this.horaAMinutos(estacion.horaInicioTurno);
                const tiempoCuadrante = this.horaAMinutos(horaInicio);
                
                // Solo considerar horarios iguales o posteriores al inicio de turno
                if (tiempoCuadrante >= tiempoEstacion) {
                    const diferencia = tiempoCuadrante - tiempoEstacion;
                    
                    if (!mapaCuadrantes.has(nombreCuadrante) || diferencia < mapaCuadrantes.get(nombreCuadrante).diferenciaMin) {
                        mapaCuadrantes.set(nombreCuadrante, {
                            idEstacion: estacion.id,
                            horaInicioOriginal: horaInicio,
                            horaInicioReal: horaInicio,
                            diferenciaMin: diferencia
                        });
                    }
                }
            }
        });

        const cuadrantes = [];
        mapaCuadrantes.forEach((valor, clave) => {
            cuadrantes.push({
                id: `cuadrante_${cuadrantes.length + 1}`,
                nombre: clave,
                idEstacion: valor.idEstacion,
                horaInicioOriginal: valor.horaInicioOriginal,
                horaInicioReal: valor.horaInicioReal
            });
            
            const estacion = Array.from(mapaEstaciones.values()).find(e => e.id === valor.idEstacion);
            if (estacion) {
                estacion.cuadrantes.push(`cuadrante_${cuadrantes.length}`);
            }
        });

        return {
            estaciones: Array.from(mapaEstaciones.values()),
            cuadrantes: cuadrantes
        };
    }

    formatearHora(valorHora) {
        if (!valorHora) return null;
        
        if (typeof valorHora === 'number') {
            const horas = Math.floor(valorHora * 24);
            const minutos = Math.floor((valorHora * 24 * 60) % 60);
            return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
        } else if (typeof valorHora === 'string') {
            const regexHora = /(\d{1,2}):(\d{2})/;
            const coincidencia = valorHora.match(regexHora);
            if (coincidencia) {
                return `${coincidencia[1].padStart(2, '0')}:${coincidencia[2]}`;
            }
        }
        
        return null;
    }

    horaAMinutos(hora) {
        const [horas, minutos] = hora.split(':').map(Number);
        return horas * 60 + minutos;
    }

    crearDatosEjemplo() {
        this.datosEstaciones = [
            {
                id: 'estacion_1',
                nombre: 'ESTACIÓN DE POLICÍA LOS ALMENDROS',
                horaInicioTurno: '06:00',
                cuadrantes: ['cuad_1', 'cuad_2', 'cuad_3'],
                activa: true
            },
            {
                id: 'estacion_2',
                nombre: 'ESTACIÓN DE POLICÍA SIMÓN BOLÍVAR',
                horaInicioTurno: '07:00',
                cuadrantes: ['cuad_4', 'cuad_5'],
                activa: true
            },
            {
                id: 'estacion_3',
                nombre: 'ESTACIÓN DE POLICÍA NORTE',
                horaInicioTurno: '05:30',
                cuadrantes: ['cuad_6', 'cuad_7', 'cuad_8'],
                activa: true
            }
        ];

        this.datosCuadrantes = [
            { id: 'cuad_1', nombre: 'MEBARMNVCCD06E02000000006', idEstacion: 'estacion_1', horaInicioOriginal: '06:15', horaInicioReal: '06:15' },
            { id: 'cuad_2', nombre: 'MEBARMNVCCD06E02000000001', idEstacion: 'estacion_1', horaInicioOriginal: '06:30', horaInicioReal: '06:30' },
            { id: 'cuad_3', nombre: 'MEBARMNVCCD06E02000000004', idEstacion: 'estacion_1', horaInicioOriginal: '05:45', horaInicioReal: '05:45' },
            { id: 'cuad_4', nombre: 'MEBARMNVCCD03E01C04000012', idEstacion: 'estacion_2', horaInicioOriginal: '07:15', horaInicioReal: '07:15' },
            { id: 'cuad_5', nombre: 'MEBARMNVCCD03E01C05000015', idEstacion: 'estacion_2', horaInicioOriginal: '06:45', horaInicioReal: '06:45' },
            { id: 'cuad_6', nombre: 'MEBARMNVCCD02E01C02000006', idEstacion: 'estacion_3', horaInicioOriginal: '05:15', horaInicioReal: '05:15' },
            { id: 'cuad_7', nombre: 'MEBARMNVCCD02E01C02000005', idEstacion: 'estacion_3', horaInicioOriginal: '05:45', horaInicioReal: '05:45' },
            { id: 'cuad_8', nombre: 'MEBARMNVCCD02E01C01000017', idEstacion: 'estacion_3', horaInicioOriginal: '06:00', horaInicioReal: '06:00' }
        ];

        this.renderizarEstaciones();
        this.actualizarEstadisticas();
        this.actualizarResumen();
        this.actualizarCuadrantesAlerta();
        this.actualizarCuadrantesRetraso();
        document.getElementById('comparison-section').style.display = 'block';
    }

    renderizarEstaciones() {
        const contenedor = document.getElementById('stations-container');
        contenedor.innerHTML = '';

        this.datosEstaciones.forEach(estacion => {
            const tarjetaEstacion = this.crearTarjetaEstacion(estacion);
            contenedor.appendChild(tarjetaEstacion);
        });
    }

    crearTarjetaEstacion(estacion) {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'station-card';
        tarjeta.innerHTML = `
            <div class="station-header">
                <div class="station-name">
                    <i class="fas fa-building"></i>${estacion.nombre}
                </div>
                <div class="status-badge ${estacion.activa ? 'status-active' : 'status-inactive'}">
                    ${estacion.activa ? 'Activa' : 'Inactiva'}
                </div>
            </div>
            
            <div class="time-input-group">
                <label for="time-${estacion.id}">
                    <i class="fas fa-clock"></i>Horario de Inicio de Turno
                </label>
                <input type="time" id="time-${estacion.id}" class="time-input" 
                       value="${estacion.horaInicioTurno}" 
                       onchange="sistemaPolicia.actualizarHoraEstacion('${estacion.id}', this.value)">
            </div>
            
            <button class="btn btn-primary" onclick="sistemaPolicia.compararCuadrantes('${estacion.id}')">
                <i class="fas fa-sync-alt"></i> Comparar Horarios
            </button>
            
            <div class="quadrants-list" id="quadrants-${estacion.id}"></div>
        `;
        
        // Renderizar los cuadrantes de manera optimizada
        const contenedorCuadrantes = tarjeta.querySelector(`#quadrants-${estacion.id}`);
        contenedorCuadrantes.appendChild(this.renderizarCuadrantes(estacion));
        
        return tarjeta;
    }

    renderizarCuadrantes(estacion) {
        const fragment = document.createDocumentFragment();
        
        const cuadrantes = this.datosCuadrantes.filter(c => 
            c.idEstacion === estacion.id && 
            this.horaAMinutos(c.horaInicioReal) >= this.horaAMinutos(estacion.horaInicioTurno)
        );
        
        cuadrantes.forEach(cuadrante => {
            const tiempoEstacion = this.horaAMinutos(estacion.horaInicioTurno);
            const tiempoCuadrante = this.horaAMinutos(cuadrante.horaInicioReal);
            const diferenciaMinutos = tiempoCuadrante - tiempoEstacion;
            
            const claseDiferencia = this.obtenerClaseDiferenciaTiempo(diferenciaMinutos);
            const textoDiferencia = this.formatearRetraso(diferenciaMinutos);
            
            const elemento = document.createElement('div');
            elemento.className = 'quadrant-item';
            elemento.innerHTML = `
                <div class="quadrant-name">
                    <i class="fas fa-map-marker-alt"></i>${cuadrante.nombre}
                </div>
                <div class="time-difference ${claseDiferencia}">
                    ${cuadrante.horaInicioReal} (${textoDiferencia})
                </div>
            `;
            fragment.appendChild(elemento);
        });
        
        return fragment;
    }

    formatearRetraso(minutos) {
        if (minutos === 0) return 'A tiempo';
        
        const horas = Math.floor(minutos / 60);
        const mins = minutos % 60;
        
        if (horas > 0) {
            return `+${horas}h ${mins}min`;
        }
        return `+${mins}min`;
    }

    obtenerClaseDiferenciaTiempo(minutosRetraso) {
        if (minutosRetraso <= 30) return 'time-green';
        if (minutosRetraso <= 45) return 'time-yellow';
        return 'time-red';
    }

    actualizarHoraEstacion(idEstacion, nuevaHora) {
        const estacion = this.datosEstaciones.find(e => e.id === idEstacion);
        if (estacion) {
            estacion.horaInicioTurno = nuevaHora;
            this.compararCuadrantes(idEstacion);
            this.actualizarEstadisticas();
            this.actualizarResumen();
            this.actualizarCuadrantesAlerta();
            this.actualizarCuadrantesRetraso();
        }
    }

    compararCuadrantes(idEstacion) {
        const estacion = this.datosEstaciones.find(e => e.id === idEstacion);
        if (!estacion) return;

        const contenedorCuadrantes = document.getElementById(`quadrants-${idEstacion}`);
        contenedorCuadrantes.innerHTML = '';
        contenedorCuadrantes.appendChild(this.renderizarCuadrantes(estacion));
    }

    actualizarEstadisticas() {
        const contenedorEstadisticas = document.getElementById('stats-grid');
        const totalEstaciones = this.datosEstaciones.length;
        const estacionesActivas = this.datosEstaciones.filter(e => e.activa).length;
        
        let contadorVerde = 0;
        let contadorAmarillo = 0;
        let contadorRojo = 0;

        this.datosEstaciones.forEach(estacion => {
            const cuadrantes = this.datosCuadrantes.filter(c => 
                c.idEstacion === estacion.id && 
                this.horaAMinutos(c.horaInicioReal) >= this.horaAMinutos(estacion.horaInicioTurno)
            );
            
            cuadrantes.forEach(cuadrante => {
                const tiempoEstacion = this.horaAMinutos(estacion.horaInicioTurno);
                const tiempoCuadrante = this.horaAMinutos(cuadrante.horaInicioReal);
                const minutosRetraso = tiempoCuadrante - tiempoEstacion;
                
                if (minutosRetraso <= 30) {
                    contadorVerde++;
                } else if (minutosRetraso <= 45) {
                    contadorAmarillo++;
                } else {
                    contadorRojo++;
                }
            });
        });

        const totalCuadrantes = contadorVerde + contadorAmarillo + contadorRojo;
        const porcentajeVerde = totalCuadrantes > 0 ? (contadorVerde / totalCuadrantes) * 100 : 0;
        const porcentajeAmarillo = totalCuadrantes > 0 ? (contadorAmarillo / totalCuadrantes) * 100 : 0;
        const porcentajeRojo = totalCuadrantes > 0 ? (contadorRojo / totalCuadrantes) * 100 : 0;

        this.estadisticas = {
            totalEstaciones,
            estacionesActivas,
            totalCuadrantes,
            cuadrantesATiempo: contadorVerde,
            cuadrantesAlerta: contadorAmarillo,
            cuadrantesRetraso: contadorRojo,
            porcentajeVerde,
            porcentajeAmarillo,
            porcentajeRojo
        };

        // Mostrar/ocultar secciones según los datos
        document.getElementById('alert-section').style.display = contadorAmarillo > 0 ? 'block' : 'none';
        document.getElementById('delay-section').style.display = contadorRojo > 0 ? 'block' : 'none';

        contenedorEstadisticas.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-shield-alt"></i></div>
                <div class="stat-number">${totalEstaciones}</div>
                <div class="stat-label">Total Estaciones</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-number">${estacionesActivas}</div>
                <div class="stat-label">Estaciones Activas</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-map-marked-alt"></i></div>
                <div class="stat-number">${totalCuadrantes}</div>
                <div class="stat-label">Total Cuadrantes</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-circle" style="color: #2e7d32"></i></div>
                <div class="stat-number">${contadorVerde}</div>
                <div class="stat-label">0-30 min</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-circle" style="color: #f57f17"></i></div>
                <div class="stat-number">${contadorAmarillo}</div>
                <div class="stat-label">31-45 min</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-circle" style="color: #c62828"></i></div>
                <div class="stat-number">${contadorRojo}</div>
                <div class="stat-label">46+ min</div>
            </div>
            
            <div class="performance-container">
                <div class="performance-card">
                    <h4><i class="fas fa-chart-line"></i> Desempeño General</h4>
                    
                    <div class="performance-indicator">
                        <span>0-30 min</span>
                        <div class="performance-bar">
                            <div class="performance-fill performance-good" 
                                 style="width: ${porcentajeVerde}%"></div>
                        </div>
                        <span>${porcentajeVerde.toFixed(1)}%</span>
                    </div>
                    
                    <div class="performance-indicator">
                        <span>31-45 min</span>
                        <div class="performance-bar">
                            <div class="performance-fill performance-medium" 
                                 style="width: ${porcentajeAmarillo}%"></div>
                        </div>
                        <span>${porcentajeAmarillo.toFixed(1)}%</span>
                    </div>
                    
                    <div class="performance-indicator">
                        <span>46+ min</span>
                        <div class="performance-bar">
                            <div class="performance-fill performance-bad" 
                                 style="width: ${porcentajeRojo}%"></div>
                        </div>
                        <span>${porcentajeRojo.toFixed(1)}%</span>
                    </div>
                </div>
                
                <div class="performance-card">
                    <h4><i class="fas fa-info-circle"></i> Resumen de Estado</h4>
                    <div class="performance-indicator">
                        <span><i class="fas fa-check-circle" style="color: #2e7d32"></i> A tiempo</span>
                        <span>${contadorVerde} (${porcentajeVerde.toFixed(1)}%)</span>
                    </div>
                    <div class="performance-indicator">
                        <span><i class="fas fa-exclamation-triangle" style="color: #f57f17"></i> Alerta</span>
                        <span>${contadorAmarillo} (${porcentajeAmarillo.toFixed(1)}%)</span>
                    </div>
                    <div class="performance-indicator">
                        <span><i class="fas fa-times-circle" style="color: #c62828"></i> Retraso</span>
                        <span>${contadorRojo} (${porcentajeRojo.toFixed(1)}%)</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    actualizarResumen() {
        // Actualizamos el resumen llamando al filtro sin filtro (muestra todo)
        this.filtrarResumen('estaciones', '');
        this.filtrarResumen('cuadrantes', '');
    }

    // Actualizar cuadrantes en alerta (31-45 min)
    actualizarCuadrantesAlerta() {
        const contenedor = document.getElementById('alert-quadrants-container');
        contenedor.innerHTML = '';
        
        this.datosCuadrantes.forEach(cuadrante => {
            const estacion = this.datosEstaciones.find(e => e.id === cuadrante.idEstacion);
            if (!estacion) return;
            
            const tiempoEstacion = this.horaAMinutos(estacion.horaInicioTurno);
            const tiempoCuadrante = this.horaAMinutos(cuadrante.horaInicioReal);
            const minutosRetraso = tiempoCuadrante - tiempoEstacion;
            
            if (minutosRetraso > 30 && minutosRetraso <= 45) {
                const elemento = document.createElement('div');
                elemento.className = 'quadrant-item';
                elemento.innerHTML = `
                    <div class="quadrant-name">
                        <i class="fas fa-map-marker-alt"></i>${cuadrante.nombre}
                    </div>
                    <div class="time-difference time-yellow">
                        ${cuadrante.horaInicioReal} (${this.formatearRetraso(minutosRetraso)})
                    </div>
                    <div class="station-info">
                        <i class="fas fa-building"></i>${estacion.nombre}
                    </div>
                `;
                contenedor.appendChild(elemento);
            }
        });
    }

    // Actualizar cuadrantes en retraso (46+ min)
    actualizarCuadrantesRetraso() {
        const contenedor = document.getElementById('delay-quadrants-container');
        contenedor.innerHTML = '';
        
        this.datosCuadrantes.forEach(cuadrante => {
            const estacion = this.datosEstaciones.find(e => e.id === cuadrante.idEstacion);
            if (!estacion) return;
            
            const tiempoEstacion = this.horaAMinutos(estacion.horaInicioTurno);
            const tiempoCuadrante = this.horaAMinutos(cuadrante.horaInicioReal);
            const minutosRetraso = tiempoCuadrante - tiempoEstacion;
            
            if (minutosRetraso > 45) {
                const elemento = document.createElement('div');
                elemento.className = 'quadrant-item';
                elemento.innerHTML = `
                    <div class="quadrant-name">
                        <i class="fas fa-map-marker-alt"></i>${cuadrante.nombre}
                    </div>
                    <div class="time-difference time-red">
                        ${cuadrante.horaInicioReal} (${this.formatearRetraso(minutosRetraso)})
                    </div>
                    <div class="station-info">
                        <i class="fas fa-building"></i>${estacion.nombre}
                    </div>
                `;
                contenedor.appendChild(elemento);
            }
        });
    }

    mostrarCarga(mostrar) {
        document.getElementById('loading').style.display = mostrar ? 'block' : 'none';
    }

    mostrarError(mensaje) {
        document.getElementById('error-container').innerHTML = `
            <div class="error-message message">
                <i class="fas fa-exclamation-circle"></i>
                ${mensaje}
            </div>
        `;
    }

    mostrarExito(mensaje) {
        document.getElementById('success-container').innerHTML = `
            <div class="success-message message">
                <i class="fas fa-check-circle"></i>
                ${mensaje}
            </div>
        `;
    }

    limpiarMensajes() {
        document.getElementById('error-container').innerHTML = '';
        document.getElementById('success-container').innerHTML = '';
    }

    filtrarResumen(tipo, filtro) {
        if (tipo === 'estaciones') {
            const contenedor = document.getElementById('stations-summary');
            contenedor.innerHTML = '';
            
            this.datosEstaciones
                .filter(estacion => 
                    estacion.nombre.toLowerCase().includes(filtro.toLowerCase())
                )
                .forEach(estacion => {
                    const contadorCuadrantes = this.datosCuadrantes.filter(c => 
                        c.idEstacion === estacion.id && 
                        this.horaAMinutos(c.horaInicioReal) >= this.horaAMinutos(estacion.horaInicioTurno)
                    ).length;
                    
                    const elementoEstacion = document.createElement('div');
                    elementoEstacion.className = 'station-item';
                    elementoEstacion.innerHTML = `
                        <div class="station-item-name">${estacion.nombre}</div>
                        <div class="station-item-quadrants">${contadorCuadrantes} cuadrantes</div>
                    `;
                    contenedor.appendChild(elementoEstacion);
                });
        } else {
            const contenedor = document.getElementById('quadrants-summary');
            contenedor.innerHTML = '';
            
            this.datosCuadrantes
                .filter(cuadrante => {
                    const estacion = this.datosEstaciones.find(e => e.id === cuadrante.idEstacion);
                    const cumpleFiltro = cuadrante.nombre.toLowerCase().includes(filtro.toLowerCase()) || 
                                        (estacion && estacion.nombre.toLowerCase().includes(filtro.toLowerCase()));
                    
                    if (estacion) {
                        const tiempoEstacion = this.horaAMinutos(estacion.horaInicioTurno);
                        const tiempoCuadrante = this.horaAMinutos(cuadrante.horaInicioReal);
                        return cumpleFiltro && tiempoCuadrante >= tiempoEstacion;
                    }
                    return false;
                })
                .forEach(cuadrante => {
                    const estacion = this.datosEstaciones.find(e => e.id === cuadrante.idEstacion);
                    if (!estacion) return;
                    
                    const tiempoEstacion = this.horaAMinutos(estacion.horaInicioTurno);
                    const tiempoCuadrante = this.horaAMinutos(cuadrante.horaInicioReal);
                    const minutosRetraso = tiempoCuadrante - tiempoEstacion;
                    const claseDiferencia = this.obtenerClaseDiferenciaTiempo(minutosRetraso);
                    
                    const elementoCuadrante = document.createElement('div');
                    elementoCuadrante.className = 'quadrant-item-summary';
                    elementoCuadrante.innerHTML = `
                        <div class="quadrant-name-summary">
                            <i class="fas fa-map-marker-alt"></i>${cuadrante.nombre}
                        </div>
                        <div class="quadrant-info">
                            <span class="time-badge ${claseDiferencia}">${cuadrante.horaInicioReal}</span>
                            <span>${estacion.nombre}</span>
                        </div>
                    `;
                    contenedor.appendChild(elementoCuadrante);
                });
        }
    }

    // Función para exportar a PDF
    exportarAPDF() {
        // Verificar que tenemos datos
        if (this.datosEstaciones.length === 0 || this.datosCuadrantes.length === 0) {
            this.mostrarError('No hay datos para exportar. Por favor, cargue un archivo primero.');
            return;
        }

        this.mostrarCarga(true);
        this.mostrarExito('Generando PDF...');

        // Obtener el contenedor principal
        const element = document.getElementById('container');
        const originalDisplay = element.style.display;
        
        // Asegurarse de que todo esté visible
        element.style.display = 'block';
        document.getElementById('comparison-section').style.display = 'block';
        if (this.estadisticas.cuadrantesAlerta > 0) document.getElementById('alert-section').style.display = 'block';
        if (this.estadisticas.cuadrantesRetraso > 0) document.getElementById('delay-section').style.display = 'block';

        // Crear PDF
        html2canvas(element, {
            scale: 2, // Mejor calidad
            useCORS: true,
            logging: false,
            scrollY: -window.scrollY
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
            const imgWidth = pdf.internal.pageSize.getWidth();
            const imgHeight = canvas.height * imgWidth / canvas.width;
            
            // Ajustar la altura de la imagen al tamaño de página
            const pageHeight = pdf.internal.pageSize.getHeight();
            let position = 0;
            
            // Agregar primera página
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            position -= pageHeight;
            
            // Agregar páginas adicionales si es necesario
            while (position > -imgHeight) {
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                position -= pageHeight;
            }
            
            // Guardar PDF
            const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            pdf.save(`reporte_horarios_${fecha}.pdf`);
            
            // Restaurar estado original
            element.style.display = originalDisplay;
            this.mostrarCarga(false);
            this.limpiarMensajes();
            this.mostrarExito('PDF generado exitosamente');
        }).catch(error => {
            element.style.display = originalDisplay;
            this.mostrarCarga(false);
            this.mostrarError('Error al generar el PDF: ' + error.message);
        });
    }
}

// Inicializar el sistema
const sistemaPolicia = new SistemaHorariosPolicia();