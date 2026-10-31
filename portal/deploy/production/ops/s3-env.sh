# Configuração do rclone para o armazenamento interno. Carregado pelos demais scripts.
export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_LOCAL_TYPE=s3
export RCLONE_CONFIG_LOCAL_PROVIDER=Other
export RCLONE_CONFIG_LOCAL_ENDPOINT=http://armazenamento:8333
export RCLONE_CONFIG_LOCAL_ACCESS_KEY_ID="$PORTAL_S3_OPS_ACCESS_KEY"
export RCLONE_CONFIG_LOCAL_SECRET_ACCESS_KEY="$PORTAL_S3_OPS_SECRET_KEY"
export RCLONE_CONFIG_LOCAL_FORCE_PATH_STYLE=true
export RCLONE_S3_REGION=us-east-1
BUCKET=${PORTAL_S3_BUCKET:-portal-private}
