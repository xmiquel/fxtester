FROM python:3.14-slim

ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION

USER 0
WORKDIR /app
COPY pyproject.toml .
RUN ["python", "-m", "pip", "install", "--no-cache-dir", "uv"]
RUN ["python", "-m", "uv", "pip", "install", "--system", "."]
RUN ["python", "-c", "import sys, sysconfig, duckdb; assert sys.implementation.name == 'cpython'; assert sys.version_info[:2] == (3, 14); assert sysconfig.get_config_var('Py_GIL_DISABLED') != 1; print(f'CPython {sys.version.split()[0]}, DuckDB {duckdb.__version__}')"]
COPY app ./app
USER 65532
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
