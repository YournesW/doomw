class Dosbox {
  constructor(options) {
    this.onload = options.onload;
    this.onrun = options.onrun;
    this.ui = new Dosbox.UI(options);
    this.module = new Dosbox.Module({
      canvas: this.ui.canvas
    });

    this.ui.onStart(() => {
      this.ui.showLoader();
      return this.downloadScript();
    });
  }

  async run(archiveUrl, executable) {
    return new Dosbox.Mount(this.module, archiveUrl, {
      success: () => {
        this.ui.updateMessage(`Launching ${executable}`);
        
        const hide = () => this.ui.hideLoader();
        const execute = () => this._dosbox_main(this, executable);
        
        setTimeout(execute, 1000);
        setTimeout(hide, 3000);
      },
      progress: (total, current) => {
        this.ui.updateMessage(`Mount ${executable} (${(current * 100 / total | 0)}%)`);
      }
    });
  }

  requestFullScreen() {
    if (this.module.requestFullScreen) {
      return this.module.requestFullScreen(true, false);
    }
  }

  async downloadScript() {
    this.module.setStatus('Loading js-dos');
    this.ui.updateMessage('Loading js-dos');

    return new Dosbox.Xhr('components/js-dos-apiv3.js', {
      success: (script) => {
        this.ui.updateMessage('Initializing dosbox');
        setTimeout(() => {
          this._jsdos_init(this.module, script, this.onload);
        }, 1000);
      },
      progress: (total, current) => {
        this.ui.updateMessage(`Loading js-dos (${(current * 100 / total | 0)}%)`);
      }
    });
  }

  _jsdos_init(module, script, onload) {
    const Module = module;
    eval(script); // Required for DOS emulation
    if (onload) {
      return onload(this);
    }
  }

  _dosbox_main(dosbox, executable) {
    try {
      if (dosbox.onrun) {
        setTimeout(() => {
          return dosbox.onrun(dosbox, executable);
        }, 1000);
      }
      return dosbox.module.ccall('dosbox_main', 'int', ['string'], [executable]);
    } catch (error) {
      if (error === 'SimulateInfiniteLoop') {
        // Expected behavior
        return;
      }
      console.error(error);
    }
  }
}

class DosboxModule {
  constructor(options) {
    this.elCanvas = options.canvas;
    this.canvas = this.elCanvas[0];
    this.preRun = [];
    this.postRun = [];
    this.totalDependencies = 0;
  }

  print(text) {
    console.log(Array.prototype.slice.call(arguments).join(' '));
  }

  printErr(text) {
    console.error(Array.prototype.slice.call(arguments).join(' '));
  }

  setStatus(text) {
    console.log(text);
  }

  monitorRunDependencies(left) {
    this.totalDependencies = Math.max(this.totalDependencies, left);
    const status = left ? 
      `Preparing... (${this.totalDependencies - left}/${this.totalDependencies})` : 
      'All downloads complete.';
    this.setStatus(status);
  }
}

class DosboxMount {
  constructor(module, url, options) {
    this.module = module;
    
    new Dosbox.Xhr(url, {
      success: (data) => {
        const bytes = this._toArray(data);
        if (this._mountZip(bytes)) {
          return options.success();
        }
        console.error('Unable to mount', url);
      },
      progress: options.progress
    });
  }

  _mountZip(bytes) {
    const buffer = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, buffer);
    const extracted = this.module.ccall('extract_zip', 'int', ['number', 'number'], [buffer, bytes.length]);
    this.module._free(buffer);
    return extracted === 0;
  }

  _toArray(data) {
    if (typeof data === 'string') {
      const arr = new Array(data.length);
      for (let i = 0; i < data.length; i++) {
        arr[i] = data.charCodeAt(i);
      }
      return arr;
    }
    return data;
  }
}

class DosboxXhr {
  constructor(url, options) {
    this.success = options.success;
    this.progress = options.progress;

    try {
      this.xhr = new XMLHttpRequest();
      this.xhr.open('GET', url, true);
      this.xhr.overrideMimeType('text/plain; charset=x-user-defined');
      
      this.xhr.addEventListener('progress', (evt) => {
        if (this.progress) {
          this.progress(evt.total, evt.loaded);
        }
      });

      this.xhr.onreadystatechange = () => this._onReadyStateChange();
      this.xhr.send();
    } catch (error) {
      console.error('XHR failed:', error);
      throw error;
    }
  }

  _onReadyStateChange() {
    if (this.xhr.readyState === 4 && this.success) {
      this.success(this.xhr.responseText);
    }
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dosbox;
} else {
  window.Dosbox = Dosbox;
}
