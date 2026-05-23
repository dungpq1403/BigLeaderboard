import styles from './loading.module.css';

export default function GameLoading() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingContent}>
        <div className={styles.spinnerWrapper}>
          <div className={styles.spinner}></div>
        </div>
        <p className={styles.loadingText}>Loading game information...</p>
      </div>
    </div>
  );
}