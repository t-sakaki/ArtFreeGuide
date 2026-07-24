'use client';

import React, { useState } from 'react';

interface FeedbackControlsProps {
  artworkId?: number;
  imageId?: number;
  onImageInvalidated?: (replacementImage?: { id: number; url: string }) => void;
}

export function FeedbackControls({ artworkId, imageId, onImageInvalidated }: FeedbackControlsProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [submittedRating, setSubmittedRating] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentSubmitted, setCommentSubmitted] = useState(false);

  const [isReportingImage, setIsReportingImage] = useState(false);
  const [imageReported, setImageReported] = useState(false);

  const handleRate = async (score: number) => {
    setRating(score);
    setSubmittedRating(true);

    if (artworkId) {
      try {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artwork_id: artworkId,
            type: 'content_quality',
            score
          })
        });
      } catch (err) {
        console.error('Failed to submit rating:', err);
      }
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      if (artworkId) {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artwork_id: artworkId,
            type: 'fact_correction',
            comment: commentText
          })
        });
      }
      setCommentSubmitted(true);
      setTimeout(() => {
        setShowCommentModal(false);
        setCommentText('');
        setCommentSubmitted(false);
      }, 1800);
    } catch (err) {
      console.error('Failed to submit comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleReportImage = async () => {
    if (!imageId && !artworkId) return;

    setIsReportingImage(true);
    try {
      const res = await fetch('/api/images/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: imageId || 0,
          artwork_id: artworkId,
          is_valid: false
        })
      });

      const data = await res.json();
      setImageReported(true);

      if (data.replacementImage && onImageInvalidated) {
        onImageInvalidated(data.replacementImage);
      }
    } catch (err) {
      console.error('Failed to report image:', err);
    } finally {
      setIsReportingImage(false);
    }
  };

  return (
    <div className="mt-4 p-4 rounded-xl bg-black/30 border border-white/10 backdrop-blur-md text-white/90 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Rating Section */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium">解説の評価:</span>
          <div className="flex space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => handleRate(star)}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  rating && rating >= star
                    ? 'bg-amber-400 text-slate-950 scale-110 shadow-sm shadow-amber-400/50'
                    : 'bg-white/5 hover:bg-white/15 text-slate-400'
                }`}
                title={`${star}点`}
              >
                ★
              </button>
            ))}
          </div>
          {submittedRating && (
            <span className="text-xs text-emerald-400 ml-2 animate-fade-in">感謝！評価を送信しました</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowCommentModal(true)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 border border-white/10 transition-colors"
          >
            💬 フィードバック・ご意見
          </button>

          {imageId && (
            <button
              type="button"
              disabled={isReportingImage || imageReported}
              onClick={handleReportImage}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                imageReported
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 border-white/10'
              }`}
            >
              {imageReported ? '✓ 画像報告済み' : '⚠️ 不適切な画像/表示不可'}
            </button>
          )}
        </div>
      </div>

      {/* Modal for detail feedback comment */}
      {showCommentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-base font-semibold text-white mb-2">フィードバック送信</h3>
            <p className="text-xs text-slate-400 mb-4">
              解説内容の訂正や追加情報、ご意見をお知らせください。ナレッジベースの品質改善に役立てられます。
            </p>

            {commentSubmitted ? (
              <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-center text-xs font-medium">
                ご意見ありがとうございました！
              </div>
            ) : (
              <form onSubmit={handleSubmitComment} className="space-y-4">
                <textarea
                  rows={4}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="例：制作年や技法の表記についての補足情報..."
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400/50 resize-none"
                  required
                />
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowCommentModal(false)}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingComment}
                    className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-medium text-xs shadow-md transition-colors"
                  >
                    {isSubmittingComment ? '送信中...' : '送信する'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
